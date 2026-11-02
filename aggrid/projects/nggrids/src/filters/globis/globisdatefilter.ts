import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, OnDestroy, Renderer2, WritableSignal, computed, inject, signal, viewChild } from '@angular/core';
import { FormattingService, MaskFormat, ServoyPublicService } from '@servoy/public';
import type { I18NListener } from '@servoy/public';
import type { TempusDominus } from '@eonasdan/tempus-dominus';
import { DateTime as DateTimeLuxon } from 'luxon';
import { DateFilter } from '../datefilter';

let filterCount = 0;

// the relative operators of the extended filter builder, with the i18n key of their label and the English label
const RELATIVE_OPERATORS: Record<string, { key: string; text: string }> = {
    today: { key: 'globis.label.extended_filter_builder$operator_today', text: 'Today' },
    thisWeek: { key: 'globis.label.extended_filter_builder$operator_this_week', text: 'This week' },
    thisMonth: { key: 'globis.label.extended_filter_builder$operator_this_month', text: 'This month' },
    dayOffset: { key: 'globis.label.extended_filter_builder$operator_day_offset', text: 'Today +/- days' },
    beforeDayOffset: { key: 'globis.label.extended_filter_builder$operator_before_last_x_days', text: '<= before today +/- days' },
    afterDayOffset: { key: 'globis.label.extended_filter_builder$operator_after_last_x_days', text: '>= after today +/- days' },
    betweenDayOffsets: { key: 'globis.label.extended_filter_builder$operator_between_relative_days', text: 'Between today +/- days' }
};

// the operators in the order of the popup
const OPERATORS = ['equals', 'notEqual', 'lessThan', 'greaterThan', 'inRange', 'today', 'thisWeek', 'thisMonth',
    'dayOffset', 'beforeDayOffset', 'afterDayOffset', 'betweenDayOffsets', 'blank', 'notBlank'];
const DATE_OPERATORS = new Set(['equals', 'notEqual', 'lessThan', 'greaterThan', 'inRange']);
const DAYS_OPERATORS = new Set(['dayOffset', 'beforeDayOffset', 'afterDayOffset', 'betweenDayOffsets']);

/**
 * [GLR-7459] The range of a relative date filter in epoch ms, the same as getDateRangeForOperator of the extended filter
 * builder (extended_filter_query_builder.js) and getRelativeDateRange in groupingtable_server.js. A null bound leaves
 * the range open on that side. Null when the filter is not relative.
 */
export function getRelativeDateRange(model: any, now = new Date()): { start: number | null; end: number | null } | null {
    const dayStart = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime();
    const dayEnd = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 23, 59, 59, 999).getTime();
    // the week runs from Monday to Sunday
    const daysSinceMonday = (now.getDay() + 6) % 7;
    switch (model.type) {
        case 'today':
            return { start: dayStart(0), end: dayEnd(0) };
        case 'thisWeek':
            return { start: dayStart(-daysSinceMonday), end: dayEnd(6 - daysSinceMonday) };
        case 'thisMonth':
            return { start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime() };
        case 'dayOffset':
            return { start: dayStart(model.days), end: dayEnd(model.days) };
        case 'beforeDayOffset':
            return { start: null, end: dayStart(model.days) };
        case 'afterDayOffset':
            return { start: dayStart(model.days), end: null };
        case 'betweenDayOffsets':
            return { start: dayStart(model.days), end: dayEnd(model.daysTo) };
        default:
            return null;
    }
}

// local midnight of a time in epoch ms
const startOfDay = (ms: number) => {
    const date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/**
 * The operator, the signed day counts and the date inputs of one condition of the popup.
 */
class DateCondition {
    readonly operator = signal('equals');
    readonly days = signal<number | null>(null);
    readonly daysTo = signal<number | null>(null);

    constructor(readonly from: () => HTMLInputElement | undefined, readonly to: () => HTMLInputElement | undefined) {
    }
}

/**
 * [GLR-7459] Date filter whose popup also has the relative operators of the extended filter builder (today, this week,
 * this month, today +/- days), with a second condition joined by AND / OR. The floating filter stays the date picker of
 * DateFilter for one date, other filters show there as a read-only summary. The clear button and Backspace / Delete on
 * the summary remove the filter.
 */
@Component({
  selector: 'aggrid-datagrid-globisdatefilter',
  template: `
    <div><div class="{{ !isFloating ? 'ag-filter-body-wrapper ag-simple-filter-body-wrapper' : '' }}">
      <div [hidden]="isFloating" class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select">
        <ng-container *ngTemplateOutlet="operatorSelect; context: { $implicit: conditions[0] }"></ng-container>
      </div>
      <div class="ag-filter-body" [style.display]="showDateInput() ? null : 'none'">
        <div class="ag-input-wrapper" [style]="isFloating ? null : 'flex-direction: column; align-items: stretch; gap: 4px;'">
          <div class="input-group globis-date-filter-picker" id="filterdatetimepicker" data-td-target-input="nearest" data-td-target-toggle="nearest" #filterdatetimepicker>
            <input class="ag-filter-filter ag-input-field-input form-control globis-date-filter-input" type="text" id="filterText" autocomplete="off" data-td-target="#filterdatetimepicker" #element>
            <span class="input-group-text" data-td-target="#filterdatetimepicker" data-td-toggle="datetimepicker">
              <i class="fas fa-calendar"></i>
            </span>
          </div>
          <div [hidden]="isFloating || conditions[0].operator() !== 'inRange'" class="input-group globis-date-filter-picker" id="filterdatetimepickerTo"
            data-td-target-input="nearest" data-td-target-toggle="nearest" #filterdatetimepickerTo>
            <input class="ag-filter-filter ag-input-field-input form-control globis-date-filter-input" type="text" id="filterTextTo" autocomplete="off" data-td-target="#filterdatetimepickerTo" #elementTo>
            <span class="input-group-text" data-td-target="#filterdatetimepickerTo" data-td-toggle="datetimepicker">
              <i class="fas fa-calendar"></i>
            </span>
          </div>
          @if (isFloating && hasFilter()) {
            <button type="button" class="ag-button" style="margin-left: 4px; border: 0; padding: 0; background: none; cursor: pointer;" [title]="txtClearFilter" [attr.aria-label]="txtClearFilter"
              (click)="clearFilter()"><span class="ag-icon ag-icon-cross" role="presentation"></span></button>
          }
        </div>
      </div>
      @if (!isFloating) {
        <ng-container *ngTemplateOutlet="daysInputs; context: { $implicit: conditions[0] }"></ng-container>
        <div [style.display]="showSecondCondition() ? null : 'none'">
          <div class="ag-filter-condition" style="display: flex; justify-content: center; gap: 12px; padding: 4px 0;">
            <label><input type="radio" [name]="joinName" [checked]="join() === 'AND'" (change)="onJoinChange('AND')"> {{ andCondition }}</label>
            <label><input type="radio" [name]="joinName" [checked]="join() === 'OR'" (change)="onJoinChange('OR')"> {{ orCondition }}</label>
          </div>
          <div class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select">
            <ng-container *ngTemplateOutlet="operatorSelect; context: { $implicit: conditions[1] }"></ng-container>
          </div>
          <div class="ag-filter-body" [style.display]="usesDate(conditions[1]) ? null : 'none'">
            <div class="ag-input-wrapper" style="flex-direction: column; align-items: stretch; gap: 4px;">
              <div class="input-group globis-date-filter-picker" id="filterdatetimepicker2" data-td-target-input="nearest" data-td-target-toggle="nearest" #filterdatetimepicker2>
                <input class="ag-filter-filter ag-input-field-input form-control globis-date-filter-input" type="text" id="filterText2" autocomplete="off" data-td-target="#filterdatetimepicker2" #element2>
                <span class="input-group-text" data-td-target="#filterdatetimepicker2" data-td-toggle="datetimepicker">
                  <i class="fas fa-calendar"></i>
                </span>
              </div>
              <div [hidden]="conditions[1].operator() !== 'inRange'" class="input-group globis-date-filter-picker" id="filterdatetimepickerTo2"
                data-td-target-input="nearest" data-td-target-toggle="nearest" #filterdatetimepickerTo2>
                <input class="ag-filter-filter ag-input-field-input form-control globis-date-filter-input" type="text" id="filterTextTo2" autocomplete="off" data-td-target="#filterdatetimepickerTo2" #elementTo2>
                <span class="input-group-text" data-td-target="#filterdatetimepickerTo2" data-td-toggle="datetimepicker">
                  <i class="fas fa-calendar"></i>
                </span>
              </div>
            </div>
          </div>
          <ng-container *ngTemplateOutlet="daysInputs; context: { $implicit: conditions[1] }"></ng-container>
        </div>
      }
      @if (isFloating && floatingSummary() !== null) {
        <div class="ag-filter-body">
          <div class="ag-input-wrapper">
            <input class="ag-filter-filter ag-input-field-input" type="text" readonly [value]="floatingSummary()" [title]="floatingSummary()"
              (keydown)="onSummaryKeydown($event)">
            <button type="button" class="ag-button" style="margin-left: 4px; border: 0; padding: 0; background: none; cursor: pointer;" [title]="txtClearFilter" [attr.aria-label]="txtClearFilter"
              (click)="clearFilter()"><span class="ag-icon ag-icon-cross" role="presentation"></span></button>
          </div>
        </div>
      }
    </div>
    @if (hasApplyButton()) {
      <div class="ag-filter-apply-panel">
        <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onApplyFilter()">{{ txtApplyFilter }}</button>
        <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onClearFilter()">{{ txtClearFilter }}</button>
      </div>
    }</div>
    <ng-template #operatorSelect let-condition>
      <!-- the options mark the operator themselves: a [value] on the select is set before @for made the options -->
      <select style="width:100%;" (change)="onOperatorChange(condition, $event)">
        @for (operator of operators; track operator) {
          <option [value]="operator" [selected]="operator === condition.operator()">{{ operatorLabels()[operator] }}</option>
        }
      </select>
    </ng-template>
    <ng-template #daysInputs let-condition>
      @if (usesDays(condition)) {
        <div class="ag-filter-body">
          <div class="ag-input-wrapper" style="align-items: center; gap: 4px;">
            <input class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;" type="number" step="1" autocomplete="off"
              [value]="condition.days() ?? ''" (change)="onDaysChange(condition.days, $event)" (keydown.enter)="onDaysChange(condition.days, $event)">
            @if (condition.operator() === 'betweenDayOffsets') {
              <span>–</span>
              <input class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;" type="number" step="1" autocomplete="off"
                [value]="condition.daysTo() ?? ''" (change)="onDaysChange(condition.daysTo, $event)" (keydown.enter)="onDaysChange(condition.daysTo, $event)">
            }
          </div>
        </div>
      }
    </ng-template>
    `,
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobisDateFilter extends DateFilter implements OnDestroy {
    private readonly servoy = inject(ServoyPublicService);
    private readonly formatting = inject(FormattingService);
    private readonly renderer = inject(Renderer2);
    private readonly document = inject(DOCUMENT);
    private i18nListener: I18NListener | null = null;

    readonly element2Ref = viewChild<ElementRef>('element2');
    readonly elementTo2Ref = viewChild<ElementRef>('elementTo2');
    readonly filterdatetimepicker2Ref = viewChild<ElementRef>('filterdatetimepicker2');
    readonly filterdatetimepickerTo2Ref = viewChild<ElementRef>('filterdatetimepickerTo2');
    picker2: TempusDominus | null = null;
    pickerTo2: TempusDominus | null = null;
    private readonly masks: MaskFormat[] = [];

    readonly operators = OPERATORS;
    // the radio buttons of AND / OR need a name of their own per filter
    readonly joinName = 'globis-date-filter-join-' + (++filterCount);
    before!: string;
    after!: string;
    andCondition!: string;
    orCondition!: string;
    // the labels of the relative operators, translated once the i18n messages arrive
    readonly labels = signal<Record<string, string>>(
        Object.fromEntries(Object.keys(RELATIVE_OPERATORS).map((operator) => [operator, RELATIVE_OPERATORS[operator].text])));
    readonly operatorLabels = computed<Record<string, string>>(() => ({
        equals: this.equals, notEqual: this.notEqual, lessThan: this.before, greaterThan: this.after, inRange: this.inRange,
        blank: this.blank, notBlank: this.notBlank, ...this.labels()
    }));

    // the first condition uses the inputs of DateFilter, which also make the floating filter
    readonly conditions = [
        new DateCondition(() => this.elementRef()?.nativeElement, () => this.elementToRef()?.nativeElement),
        new DateCondition(() => this.element2Ref()?.nativeElement, () => this.elementTo2Ref()?.nativeElement)
    ];
    readonly join = signal<'AND' | 'OR'>('AND');
    // the second condition shows once the first one filters
    readonly showSecondCondition = signal(false);
    // the applied filter, shown by the floating filter
    readonly floatingModel = signal<any>(null);
    readonly hasFilter = computed(() => this.floatingModel() !== null);
    readonly floatingSummary = computed(() => {
        const model = this.floatingModel();
        return model && (model.operator || model.type !== 'equals') ? this.getSummary(model) : null;
    });

    agInit(params: any): void {
        super.agInit(params);
        const localeText = this.ngGrid.agGridOptions['localeText'] || {};
        this.before = localeText['before'] || 'Before';
        this.after = localeText['after'] || 'After';
        this.andCondition = localeText['andCondition'] || 'AND';
        this.orCondition = localeText['orCondition'] || 'OR';
        const operators = Object.keys(RELATIVE_OPERATORS);
        this.i18nListener = this.servoy.listenForI18NMessages(...operators.map((operator) => RELATIVE_OPERATORS[operator].key)).messages((messages) => {
            const labels: Record<string, string> = {};
            for (const operator of operators) {
                const text = messages.get(RELATIVE_OPERATORS[operator].key);
                // the labels of the extended filter builder start in lower case
                labels[operator] = text ? text.charAt(0).toUpperCase() + text.slice(1) : RELATIVE_OPERATORS[operator].text;
            }
            this.labels.set(labels);
        });
    }

    // DateFilter makes the date pickers of the first condition
    ngAfterViewInit(): void {
        super.ngAfterViewInit();
        if (!this.isFloating) {
            void this.ngGrid.loadCalendarLocale(this.config).promise.then(() => {
                this.picker2 = this.createDatepicker(this.filterdatetimepicker2Ref()!.nativeElement);
                this.pickerTo2 = this.createDatepicker(this.filterdatetimepickerTo2Ref()!.nativeElement);
                if (this.format.isMask) {
                    for (const input of [this.element2Ref()!.nativeElement, this.elementTo2Ref()!.nativeElement]) {
                        this.masks.push(new MaskFormat(this.format, this.renderer, input, this.formatting, this.document));
                    }
                }
            });
        }
    }

    usesDate(condition: DateCondition): boolean {
        return DATE_OPERATORS.has(condition.operator());
    }

    usesDays(condition: DateCondition): boolean {
        return DAYS_OPERATORS.has(condition.operator());
    }

    showDateInput(): boolean {
        return this.isFloating ? this.floatingSummary() === null : this.usesDate(this.conditions[0]);
    }

    // the popup opens with the applied filter, also when it was changed without applying it
    afterGuiAttached(): void {
        if (!this.isFloating) {
            this.showModel(this.model);
        }
    }

    setModel(model: any): void {
        super.setModel(model);
        this.showModel(model);
    }

    showModel(model: any) {
        const conditions = model?.operator ? model.conditions : [model];
        this.showCondition(0, conditions[0]);
        this.showCondition(1, conditions[1]);
        this.join.set(model?.operator ?? 'AND');
        this.updateSecondCondition();
    }

    showCondition(index: number, model: any) {
        const condition = this.conditions[index];
        condition.operator.set(model ? model.type : 'equals');
        condition.days.set(model?.days ?? null);
        condition.daysTo.set(model?.daysTo ?? null);
        const from = model?.dateFromMs == null ? '' : this.formatForInput(model.dateFromMs);
        const to = model?.dateToMs == null ? '' : this.formatForInput(model.dateToMs);
        if (index === 0) {
            // the inputs only exist once the view is created; setFilterUIValue also clears the pickers
            if (this.elementRef()) {
                this.setFilterUIValue(from);
                this.elementToRef()!.nativeElement.value = to;
            }
        } else if (this.element2Ref()) {
            this.element2Ref()!.nativeElement.value = from;
            this.elementTo2Ref()!.nativeElement.value = to;
            // [MOE-330] like DateFilter, otherwise picking the same date again does not trigger a change
            if (!from) {
                this.picker2?.clear();
                this.pickerTo2?.clear();
            }
        }
    }

    formatForInput(ms: number): string {
        return this.ngGrid.format(new Date(ms), this.format, this.format.edit && !this.format.isMask);
    }

    updateSecondCondition() {
        this.showSecondCondition.set(this.getConditionModel(this.conditions[0]) !== null);
    }

    valueChanged() {
        if (!this.isFloating) {
            this.updateSecondCondition();
        }
        super.valueChanged();
    }

    onOperatorChange(condition: DateCondition, event: Event): void {
        condition.operator.set((event.target as HTMLSelectElement).value);
        this.valueChanged();
    }

    onDaysChange(days: WritableSignal<number | null>, event: Event) {
        const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
        days.set(Number.isNaN(value) ? null : value);
        this.valueChanged();
    }

    onJoinChange(join: 'AND' | 'OR') {
        this.join.set(join);
        this.valueChanged();
    }

    // clearing removes the filter right away, also with an Apply button, like TimeFilter
    onClearFilter() {
        this.showModel(null);
        this.doFilter();
    }

    // the floating filter picked one date
    onFloatingFilterChanged(type: string | null, value: any) {
        this.showModel(null);
        super.onFloatingFilterChanged(type, value);
    }

    // only tells the grid when the filter really changed
    doFilter() {
        const model = this.getPopupModel();
        if (JSON.stringify(model) === JSON.stringify(this.model ?? null)) {
            return;
        }
        this.model = model;
        this.params.filterChangedCallback();
    }

    getPopupModel(): any {
        const first = this.getConditionModel(this.conditions[0]);
        const second = first ? this.getConditionModel(this.conditions[1]) : null;
        return first && second ? { filterType: 'date', operator: this.join(), conditions: [first, second] } : first;
    }

    getConditionModel(condition: DateCondition): any {
        const operator = condition.operator();
        if (DAYS_OPERATORS.has(operator)) {
            const days = condition.days();
            if (operator !== 'betweenDayOffsets') {
                return days === null ? null : { filterType: 'date', type: operator, days };
            }
            const daysTo = condition.daysTo();
            return days === null || daysTo === null ? null : { filterType: 'date', type: operator, days, daysTo };
        }
        if (!DATE_OPERATORS.has(operator)) {
            return { filterType: 'date', type: operator };
        }
        const uiValue = condition.from()?.value ?? '';
        const from = this.parseDate(uiValue);
        if (!from) {
            return null;
        }
        const model: Record<string, any> = { filterType: 'date', type: operator, uiValue, dateFrom: this.toModelDate(from), dateFromMs: from.getTime() };
        if (operator === 'inRange') {
            // a range needs both dates
            const to = this.parseDate(condition.to()?.value ?? '');
            if (!to) {
                return null;
            }
            model['dateTo'] = this.toModelDate(to);
            model['dateToMs'] = to.getTime();
        }
        return model;
    }

    parseDate(text: string): Date | null {
        const parsed = this.formatting.parse(text, this.format, this.format.edit && !this.format.isMask, null, true);
        return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }

    toModelDate(date: Date): string {
        return DateTimeLuxon.fromJSDate(date).toFormat('yyyy-MM-dd HH:mm:ss');
    }

    // the clear button of the floating filter
    clearFilter() {
        this.floatingParams.parentFilterInstance((parent: any) => parent.onClearFilter());
    }

    onSummaryKeydown(event: KeyboardEvent) {
        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            this.clearFilter();
        }
    }

    onParentModelChanged(parentModel: any) {
        this.floatingModel.set(parentModel ?? null);
        this.setFilterUIValue(parentModel?.type === 'equals' ? parentModel.uiValue : '');
    }

    getSummary(model: any): string {
        if (model.operator) {
            const join = model.operator === 'OR' ? this.orCondition : this.andCondition;
            return model.conditions.map((condition: any) => this.getConditionSummary(condition)).join(' ' + join + ' ');
        }
        return this.getConditionSummary(model);
    }

    getConditionSummary(model: any): string {
        const date = (ms: number) => this.ngGrid.format(new Date(ms), this.format, false);
        switch (model.type) {
            case 'equals':
                return date(model.dateFromMs);
            case 'notEqual':
                return '≠ ' + date(model.dateFromMs);
            case 'lessThan':
                return '< ' + date(model.dateFromMs);
            case 'greaterThan':
                return '> ' + date(model.dateFromMs);
            case 'inRange':
                return date(model.dateFromMs) + ' – ' + date(model.dateToMs);
            case 'blank':
                return this.blank;
            case 'notBlank':
                return this.notBlank;
            case 'dayOffset':
                return this.getOffsetText(model.days);
            case 'beforeDayOffset':
                return '≤ ' + this.getOffsetText(model.days);
            case 'afterDayOffset':
                return '≥ ' + this.getOffsetText(model.days);
            case 'betweenDayOffsets':
                return this.getOffsetText(model.days) + ' – ' + this.getOffsetText(model.daysTo);
            default:
                // today, this week, this month
                return this.labels()[model.type] ?? model.type;
        }
    }

    // e.g. "Today -7", "Today", "Today +3"
    getOffsetText(days: number): string {
        const today = this.labels()['today'];
        if (days === 0) {
            return today;
        }
        return today + (days > 0 ? ' +' : ' ') + days;
    }

    // the power grid filters its rows here, the data grid on the server
    doesFilterPass(params: any): boolean {
        const model = this.model;
        if (!model) {
            return true;
        }
        const value = params?.data ? params.data[this.params.colDef.field!] : null;
        if (model.operator) {
            const passes = (condition: any) => this.conditionPasses(condition, value);
            return model.operator === 'OR' ? model.conditions.some(passes) : model.conditions.every(passes);
        }
        return this.conditionPasses(model, value);
    }

    conditionPasses(model: any, value: any): boolean {
        const isBlank = value === null || value === undefined || value === '';
        if (model.type === 'blank' || model.type === 'notBlank') {
            return isBlank === (model.type === 'blank');
        }
        if (isBlank) {
            return false;
        }
        const time = (value instanceof Date ? value : new Date(value)).getTime();
        if (Number.isNaN(time)) {
            return true;
        }
        const range = getRelativeDateRange(model);
        if (range) {
            return (range.start === null || time >= range.start) && (range.end === null || time <= range.end);
        }
        // a date compares on the day, like DateFilter
        const day = startOfDay(time);
        const from = startOfDay(model.dateFromMs);
        switch (model.type) {
            case 'equals':
                return day === from;
            case 'notEqual':
                return day !== from;
            case 'lessThan':
                return day < from;
            case 'greaterThan':
                return day > from;
            case 'inRange':
                return day >= from && day <= startOfDay(model.dateToMs);
            default:
                return true;
        }
    }

    ngOnDestroy() {
        super.ngOnDestroy();
        this.picker2?.dispose();
        this.pickerTo2?.dispose();
        this.masks.forEach((mask) => mask.destroy());
        this.i18nListener?.destroy();
    }
}
