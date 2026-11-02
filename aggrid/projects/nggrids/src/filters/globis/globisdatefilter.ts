import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ServoyPublicService } from '@servoy/public';
import type { I18NListener } from '@servoy/public';
import { DateFilter } from '../datefilter';

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

/**
 * [GLR-7459] Date filter whose popup also has the relative operators of the extended filter builder (today, this week,
 * this month, today +/- days). The floating filter stays the date picker of DateFilter for one date, other filters
 * show there as a read-only summary. The clear button and Backspace / Delete on the summary remove the filter.
 */
@Component({
  selector: 'aggrid-datagrid-globisdatefilter',
  template: `
    <div><div class="{{ !isFloating ? 'ag-filter-body-wrapper ag-simple-filter-body-wrapper' : '' }}">
      <div [hidden]="isFloating" class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select">
        <select style="width:100%;" [(ngModel)]="selectedFilterOperation" (change)="onFilterOperationChange($event)">
          <option value="equals">{{ equals }}</option>
          <option value="notEqual">{{ notEqual }}</option>
          <option value="lessThan">{{ before }}</option>
          <option value="greaterThan">{{ after }}</option>
          <option value="inRange">{{ inRange }}</option>
          <option value="today">{{ labels()['today'] }}</option>
          <option value="thisWeek">{{ labels()['thisWeek'] }}</option>
          <option value="thisMonth">{{ labels()['thisMonth'] }}</option>
          <option value="dayOffset">{{ labels()['dayOffset'] }}</option>
          <option value="beforeDayOffset">{{ labels()['beforeDayOffset'] }}</option>
          <option value="afterDayOffset">{{ labels()['afterDayOffset'] }}</option>
          <option value="betweenDayOffsets">{{ labels()['betweenDayOffsets'] }}</option>
          <option value="blank">{{ blank }}</option>
          <option value="notBlank">{{ notBlank }}</option>
        </select>
      </div>
      <div class="ag-filter-body" [style.display]="showDateInput() ? null : 'none'">
        <div class="ag-input-wrapper">
          <div class="input-group" id="filterdatetimepicker" data-td-target-input="nearest" data-td-target-toggle="nearest" #filterdatetimepicker>
            <input class="ag-filter-filter ag-input-field-input form-control" type="text" id="filterText" autocomplete="off" data-td-target="#filterdatetimepicker" #element>
            <span class="input-group-text" data-td-target="#filterdatetimepicker" data-td-toggle="datetimepicker">
              <i class="fas fa-calendar"></i>
            </span>
          </div>
          <div [hidden]="isFloating || selectedFilterOperation !== 'inRange'" class="input-group" id="filterdatetimepickerTo"
            data-td-target-input="nearest" data-td-target-toggle="nearest" #filterdatetimepickerTo>
            <input class="ag-filter-filter ag-input-field-input form-control" type="text" id="filterTextTo" autocomplete="off" data-td-target="#filterdatetimepickerTo" #elementTo>
            <span class="input-group-text" data-td-target="#filterdatetimepickerTo" data-td-toggle="datetimepicker">
              <i class="fas fa-calendar"></i>
            </span>
          </div>
          @if (isFloating && hasFilter()) {
            <button type="button" style="border: none; background: none; padding: 0 2px; cursor: pointer;" [title]="txtClearFilter" [attr.aria-label]="txtClearFilter"
              (click)="clearFilter()">×</button>
          }
        </div>
      </div>
      @if (!isFloating && usesDays()) {
        <div class="ag-filter-body">
          <div class="ag-input-wrapper" style="align-items: center; gap: 4px;">
            <input class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;" type="number" step="1" autocomplete="off"
              [value]="days() ?? ''" (change)="onDaysChange($event, false)" (keydown.enter)="onDaysChange($event, false)">
            @if (selectedFilterOperation === 'betweenDayOffsets') {
              <span>–</span>
              <input class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;" type="number" step="1" autocomplete="off"
                [value]="daysTo() ?? ''" (change)="onDaysChange($event, true)" (keydown.enter)="onDaysChange($event, true)">
            }
          </div>
        </div>
      }
      @if (isFloating && floatingSummary() !== null) {
        <div class="ag-filter-body">
          <div class="ag-input-wrapper">
            <input class="ag-filter-filter ag-input-field-input" type="text" readonly [value]="floatingSummary()" [title]="floatingSummary()"
              (keydown)="onSummaryKeydown($event)">
            <button type="button" style="border: none; background: none; padding: 0 2px; cursor: pointer;" [title]="txtClearFilter" [attr.aria-label]="txtClearFilter"
              (click)="clearFilter()">×</button>
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
    `,
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobisDateFilter extends DateFilter implements OnDestroy {
    private readonly servoy = inject(ServoyPublicService);
    private readonly cdRef = inject(ChangeDetectorRef);
    private i18nListener: I18NListener | null = null;

    before!: string;
    after!: string;
    // the labels of the relative operators, translated once the i18n messages arrive
    readonly labels = signal<Record<string, string>>(
        Object.fromEntries(Object.keys(RELATIVE_OPERATORS).map((operator) => [operator, RELATIVE_OPERATORS[operator].text])));
    // the signed day counts of the relative operators
    readonly days = signal<number | null>(null);
    readonly daysTo = signal<number | null>(null);
    // the applied filter, shown by the floating filter
    readonly floatingModel = signal<any>(null);
    readonly hasFilter = computed(() => this.floatingModel() !== null);
    readonly floatingSummary = computed(() => {
        const model = this.floatingModel();
        return model && model.type !== 'equals' ? this.getSummary(model) : null;
    });

    agInit(params: any): void {
        super.agInit(params);
        const localeText = this.ngGrid.agGridOptions['localeText'] || {};
        this.before = localeText['before'] || 'Before';
        this.after = localeText['after'] || 'After';
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

    usesDate(): boolean {
        return DATE_OPERATORS.has(this.selectedFilterOperation);
    }

    usesDays(): boolean {
        return DAYS_OPERATORS.has(this.selectedFilterOperation);
    }

    showDateInput(): boolean {
        return this.isFloating ? this.floatingSummary() === null : this.usesDate();
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
        this.selectedFilterOperation = model ? model.type : 'equals';
        this.days.set(model?.days ?? null);
        this.daysTo.set(model?.daysTo ?? null);
        // the inputs only exist once the view is created
        if (this.elementRef()) {
            this.setFilterUIValue(model?.dateFromMs == null ? '' : this.formatForInput(model.dateFromMs));
            this.elementToRef()!.nativeElement.value = model?.dateToMs == null ? '' : this.formatForInput(model.dateToMs);
        }
        this.cdRef.markForCheck();
    }

    formatForInput(ms: number): string {
        return this.ngGrid.format(new Date(ms), this.format, this.format.edit && !this.format.isMask);
    }

    onFilterOperationChange(event: Event): void {
        this.selectedFilterOperation = (event.target as HTMLSelectElement).value;
        this.valueChanged();
    }

    onDaysChange(event: Event, to: boolean) {
        const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
        (to ? this.daysTo : this.days).set(Number.isNaN(value) ? null : value);
        this.valueChanged();
    }

    // clearing removes the filter right away, also with an Apply button, like TimeFilter
    onClearFilter() {
        this.showModel(null);
        this.doFilter();
    }

    // the floating filter picked one date
    onFloatingFilterChanged(type: string | null, value: any) {
        this.selectedFilterOperation = 'equals';
        this.cdRef.markForCheck();
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
        const operator = this.selectedFilterOperation;
        if (this.usesDays()) {
            const days = this.days();
            if (operator !== 'betweenDayOffsets') {
                return days === null ? null : { filterType: 'date', type: operator, days };
            }
            const daysTo = this.daysTo();
            return days === null || daysTo === null ? null : { filterType: 'date', type: operator, days, daysTo };
        }
        if (!this.usesDate()) {
            return { filterType: 'date', type: operator };
        }
        const date = this.getFilterRealValue();
        if (date === null) {
            return null;
        }
        const model = this.getCondition(date);
        // a range needs both dates
        return operator === 'inRange' && model['dateToMs'] === undefined ? null : model;
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
        const date = (ms: number) => this.ngGrid.format(new Date(ms), this.format, false);
        switch (model.type) {
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
        const range = this.model ? getRelativeDateRange(this.model) : null;
        if (!range) {
            return super.doesFilterPass(params);
        }
        const value = params?.data ? params.data[this.params.colDef.field!] : null;
        if (value === null || value === undefined || value === '') {
            return false;
        }
        const time = (value instanceof Date ? value : new Date(value)).getTime();
        return (range.start === null || time >= range.start) && (range.end === null || time <= range.end);
    }

    ngOnDestroy() {
        super.ngOnDestroy();
        this.i18nListener?.destroy();
    }
}
