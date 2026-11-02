import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, WritableSignal, computed, inject, signal, viewChild } from '@angular/core';
import { ServoyPublicService } from '@servoy/public';
import type { I18NListener } from '@servoy/public';
import { FilterDirective } from '../filter';

let filterCount = 0;

const TEXT_OPERATORS = ['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'in', 'notIn', 'blank', 'notBlank'];
const NUMBER_OPERATORS = ['equals', 'notEqual', 'lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual', 'inRange', 'in', 'notIn', 'blank', 'notBlank'];
const SYMBOLS: Record<string, string> = { equals: '=', notEqual: '≠', lessThan: '<', lessThanOrEqual: '≤', greaterThan: '>', greaterThanOrEqual: '≥' };
// the labels of AG Grid, overruled by the localeText of the grid
const LABELS: Record<string, string> = {
    contains: 'Contains', notContains: 'Does not contain', equals: 'Equals', notEqual: 'Does not equal', startsWith: 'Begins with', endsWith: 'Ends with',
    lessThan: 'Less than', lessThanOrEqual: 'Less than or equal to', greaterThan: 'Greater than', greaterThanOrEqual: 'Greater than or equal to',
    inRange: 'Between', blank: 'Blank', notBlank: 'Not blank', andCondition: 'AND', orCondition: 'OR', filterOoo: 'Filter...'
};
// the list operators come from the extended filter builder
const LIST_LABELS: Record<string, { key: string; text: string }> = {
    in: { key: 'globis.label.extended_filter_builder$operator_in', text: 'In' },
    notIn: { key: 'globis.label.extended_filter_builder$operator_not_in', text: 'Not in' }
};

/**
 * The operator and the typed values of one condition of the popup.
 */
class TextCondition {
    readonly operator: WritableSignal<string>;
    readonly value = signal('');
    readonly valueTo = signal('');

    constructor(operator: string) {
        this.operator = signal(operator);
    }
}

/**
 * [GLR-7459] Filter of TEXT and NUMBER columns, registered as globisTextFilter and globisNumberFilter. The popup has
 * the operators of AG Grid, "in" / "not in" a list of values separated by ";", and a second condition joined by
 * AND / OR. The floating filter filters while typing, on contains for text and equals for numbers, like the AG Grid
 * filters did; other filters show there as a read-only summary. The clear button and Backspace / Delete on the summary
 * remove the filter.
 */
@Component({
    selector: 'aggrid-datagrid-globistextfilter',
    template: `
      @if (isFloating) {
        <div><div>
          <div class="ag-filter-body">
            <div class="ag-input-wrapper">
              <input class="ag-filter-filter ag-input-field-input" type="text" autocomplete="off" [attr.inputmode]="isNumber ? 'decimal' : null"
                [style.display]="floatingSummary() !== null ? 'none' : null" (input)="onFloatingInput()" (keydown.enter)="applyFloatingInput()" #element>
              @if (floatingSummary() !== null) {
                <input class="ag-filter-filter ag-input-field-input" type="text" readonly [value]="floatingSummary()" [title]="floatingSummary()"
                  (keydown)="onSummaryKeydown($event)">
              }
              @if (hasFilter()) {
                <button type="button" class="ag-button" style="margin-left: 4px; border: 0; padding: 0; background: none; cursor: pointer;" [title]="txtClearFilter" [attr.aria-label]="txtClearFilter"
                  (click)="clearFilter()"><span class="ag-icon ag-icon-cross" role="presentation"></span></button>
              }
            </div>
          </div>
        </div></div>
      } @else {
        <div><div class="ag-filter-body-wrapper ag-simple-filter-body-wrapper">
          @for (condition of visibleConditions(); track $index) {
            @if ($index === 1) {
              <div class="ag-filter-condition" style="display: flex; justify-content: center; gap: 12px; padding: 4px 0;">
                <label><input type="radio" [name]="joinName" [checked]="join() === 'AND'" (change)="onJoinChange('AND')"> {{ labels()['andCondition'] }}</label>
                <label><input type="radio" [name]="joinName" [checked]="join() === 'OR'" (change)="onJoinChange('OR')"> {{ labels()['orCondition'] }}</label>
              </div>
            }
            <div class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select">
              <!-- the options mark the operator themselves: a [value] on the select is set before @for made the options -->
              <select style="width:100%;" (change)="onOperatorChange(condition, $event)">
                @for (operator of operators; track operator) {
                  <option [value]="operator" [selected]="operator === condition.operator()">{{ labels()[operator] }}</option>
                }
              </select>
            </div>
            @if (condition.operator() !== 'blank' && condition.operator() !== 'notBlank') {
              <div class="ag-filter-body">
                <div class="ag-input-wrapper" style="flex-direction: column; gap: 4px;">
                  <input class="ag-filter-filter ag-input-field-input ag-text-field-input" type="text" autocomplete="off"
                    [attr.inputmode]="isNumber && !isList(condition) ? 'decimal' : null" [placeholder]="isList(condition) ? 'a; b; c' : labels()['filterOoo']"
                    [value]="condition.value()" (input)="onValueInput(condition.value, $event)" (keydown.enter)="applyNow()" #value>
                  @if (condition.operator() === 'inRange') {
                    <input class="ag-filter-filter ag-input-field-input ag-text-field-input" type="text" autocomplete="off" inputmode="decimal"
                      [placeholder]="labels()['filterOoo']" [value]="condition.valueTo()" (input)="onValueInput(condition.valueTo, $event)" (keydown.enter)="applyNow()">
                  }
                </div>
              </div>
            }
          }
        </div>
        @if (hasApplyButton()) {
          <div class="ag-filter-apply-panel">
            <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onApplyFilter()">{{ txtApplyFilter }}</button>
            <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onClearFilter()">{{ txtClearFilter }}</button>
          </div>
        }</div>
      }
      `,
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobisTextFilter extends FilterDirective implements OnDestroy {
    private readonly servoy = inject(ServoyPublicService);
    private i18nListener: I18NListener | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    readonly valueRef = viewChild<ElementRef>('value');
    // the radio buttons of AND / OR need a name of their own per filter
    readonly joinName = 'globis-text-filter-join-' + (++filterCount);
    isNumber = false;
    operators = TEXT_OPERATORS;
    // the operator of the floating filter: what typing there filters on
    defaultOperator = 'contains';
    readonly labels = signal<Record<string, string>>({});

    readonly conditions = [new TextCondition('contains'), new TextCondition('contains')];
    readonly join = signal<'AND' | 'OR'>('AND');
    // the second condition shows once the first one filters
    readonly visibleConditions = computed(() => this.getConditionModel(this.conditions[0]) ? this.conditions : [this.conditions[0]]);
    // the applied filter, shown by the floating filter
    readonly floatingModel = signal<any>(null);
    readonly hasFilter = computed(() => this.floatingModel() !== null);
    readonly floatingSummary = computed(() => {
        const model = this.floatingModel();
        return model && (model.operator || model.type !== this.defaultOperator) ? this.getSummary(model) : null;
    });

    agInit(params: any): void {
        super.agInit(params);
        this.isNumber = params.column.getColDef().filter === 'globisNumberFilter';
        this.operators = this.isNumber ? NUMBER_OPERATORS : TEXT_OPERATORS;
        this.defaultOperator = this.isNumber ? 'equals' : 'contains';
        for (const condition of this.conditions) {
            condition.operator.set(this.defaultOperator);
        }
        const localeText = this.ngGrid.agGridOptions['localeText'] || {};
        const labels: Record<string, string> = {};
        for (const key of Object.keys(LABELS)) {
            labels[key] = localeText[key] || LABELS[key];
        }
        for (const operator of Object.keys(LIST_LABELS)) {
            labels[operator] = LIST_LABELS[operator].text;
        }
        this.labels.set(labels);
        this.i18nListener = this.servoy.listenForI18NMessages(...Object.values(LIST_LABELS).map((label) => label.key)).messages((messages) => {
            const translated = { ...this.labels() };
            for (const operator of Object.keys(LIST_LABELS)) {
                const text = messages.get(LIST_LABELS[operator].key);
                // the labels of the extended filter builder start in lower case
                if (text) translated[operator] = text.charAt(0).toUpperCase() + text.slice(1);
            }
            this.labels.set(translated);
        });
    }

    // the delay of filtering while typing, debounceMs of the filterParams like the AG Grid filters
    get debounceMs(): number {
        return (this.params as any)['debounceMs'] ?? 500;
    }

    isList(condition: TextCondition): boolean {
        return condition.operator() === 'in' || condition.operator() === 'notIn';
    }

    // the popup opens with the applied filter, also when it was changed without applying it
    afterGuiAttached(): void {
        if (!this.isFloating) {
            this.showModel(this.model);
            setTimeout(() => this.valueRef()?.nativeElement.focus(), 0);
        }
    }

    setModel(model: any): void {
        super.setModel(model);
        this.showModel(model);
    }

    showModel(model: any) {
        const conditions = model?.operator ? model.conditions : [model];
        this.showCondition(this.conditions[0], conditions[0]);
        this.showCondition(this.conditions[1], conditions[1]);
        this.join.set(model?.operator ?? 'AND');
    }

    showCondition(condition: TextCondition, model: any) {
        condition.operator.set(model ? model.type : this.defaultOperator);
        condition.value.set(model?.filter == null ? '' : String(model.filter));
        condition.valueTo.set(model?.filterTo == null ? '' : String(model.filterTo));
    }

    onOperatorChange(condition: TextCondition, event: Event) {
        condition.operator.set((event.target as HTMLSelectElement).value);
        this.valueChanged();
    }

    // typing filters after the debounce, like the AG Grid filters
    onValueInput(value: WritableSignal<string>, event: Event) {
        value.set((event.target as HTMLInputElement).value);
        if (!this.hasApplyButton()) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.doFilter(), this.debounceMs);
        }
    }

    // Enter filters right away, also with an Apply button
    applyNow() {
        clearTimeout(this.debounceTimer);
        this.doFilter();
    }

    onJoinChange(join: 'AND' | 'OR') {
        this.join.set(join);
        this.valueChanged();
    }

    // clearing removes the filter right away, also with an Apply button, like TimeFilter
    onClearFilter() {
        clearTimeout(this.debounceTimer);
        this.showModel(null);
        this.doFilter();
    }

    // the floating filter typed a value for the default operator, or emptied the field
    onFloatingFilterChanged(type: string | null, value: any) {
        this.showModel(value?.trim() ? { type: this.defaultOperator, filter: value } : null);
        this.doFilter();
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
        return first && second ? { filterType: first.filterType, operator: this.join(), conditions: [first, second] } : first;
    }

    getConditionModel(condition: TextCondition): any {
        const filterType = this.isNumber ? 'number' : 'text';
        const operator = condition.operator();
        if (operator === 'blank' || operator === 'notBlank') {
            return { filterType, type: operator };
        }
        const text = condition.value();
        if (this.isList(condition)) {
            const values = text.split(';').map((value) => this.parseValue(value.trim())).filter((value) => value !== null);
            return values.length ? { filterType, type: operator, filter: text, values } : null;
        }
        const filter = this.parseValue(text);
        if (filter === null) {
            return null;
        }
        if (operator === 'inRange') {
            // a range needs both numbers
            const filterTo = this.parseValue(condition.valueTo());
            return filterTo === null ? null : { filterType, type: operator, filter, filterTo };
        }
        return { filterType, type: operator, filter };
    }

    // a number takes a decimal comma as well as a point; null when there is no value
    parseValue(text: string): string | number | null {
        if (!text.trim()) {
            return null;
        }
        if (!this.isNumber) {
            return text;
        }
        const value = Number(text.trim().replace(',', '.'));
        return Number.isNaN(value) ? null : value;
    }

    onFloatingInput() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.applyFloatingInput(), this.debounceMs);
    }

    applyFloatingInput() {
        clearTimeout(this.debounceTimer);
        const value = this.getFilterUIValue();
        this.floatingParams.parentFilterInstance((parent: any) => parent.onFloatingFilterChanged(this.defaultOperator, value));
    }

    // the clear button of the floating filter
    clearFilter() {
        clearTimeout(this.debounceTimer);
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
        const input = this.elementRef()!.nativeElement as HTMLInputElement;
        const editable = parentModel && !parentModel.operator && parentModel.type === this.defaultOperator;
        // leave what is being typed alone, the filter follows it after the debounce
        if (!editable || input !== input.ownerDocument.activeElement) {
            input.value = editable ? String(parentModel.filter) : '';
        }
    }

    getFilterUIValue(): any {
        return this.elementRef()!.nativeElement.value;
    }

    setFilterUIValue(value: any) {
        this.elementRef()!.nativeElement.value = value ?? '';
    }

    getSummary(model: any): string {
        if (model.operator) {
            const join = model.operator === 'OR' ? this.labels()['orCondition'] : this.labels()['andCondition'];
            return model.conditions.map((condition: any) => this.getConditionSummary(condition)).join(' ' + join + ' ');
        }
        return this.getConditionSummary(model);
    }

    getConditionSummary(model: any): string {
        switch (model.type) {
            case 'blank':
            case 'notBlank':
                return this.labels()[model.type];
            case 'in':
                return '(' + model.values.length + ') ' + model.values.join(', ');
            case 'notIn':
                return '≠ ' + model.values.join(', ');
            case 'inRange':
                return model.filter + ' – ' + model.filterTo;
            default:
                return (SYMBOLS[model.type] ?? this.labels()[model.type]) + ' ' + model.filter;
        }
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
            // like the server: in SQL a comparison with null is never true
            return false;
        }
        return this.isNumber ? this.numberPasses(model, Number(value)) : this.textPasses(model, String(value).toLowerCase());
    }

    // text compares case-insensitively, like the server
    textPasses(model: any, value: string): boolean {
        const filter = String(model.filter).toLowerCase();
        switch (model.type) {
            case 'contains': return value.includes(filter);
            case 'notContains': return !value.includes(filter);
            case 'equals': return value === filter;
            case 'notEqual': return value !== filter;
            case 'startsWith': return value.startsWith(filter);
            case 'endsWith': return value.endsWith(filter);
            case 'in': return model.values.some((v: string) => String(v).toLowerCase() === value);
            case 'notIn': return !model.values.some((v: string) => String(v).toLowerCase() === value);
            default: return true;
        }
    }

    numberPasses(model: any, value: number): boolean {
        switch (model.type) {
            case 'equals': return value === model.filter;
            case 'notEqual': return value !== model.filter;
            case 'lessThan': return value < model.filter;
            case 'lessThanOrEqual': return value <= model.filter;
            case 'greaterThan': return value > model.filter;
            case 'greaterThanOrEqual': return value >= model.filter;
            case 'inRange': return value >= model.filter && value <= model.filterTo;
            case 'in': return model.values.includes(value);
            case 'notIn': return !model.values.includes(value);
            default: return true;
        }
    }

    ngOnDestroy() {
        clearTimeout(this.debounceTimer);
        this.i18nListener?.destroy();
    }
}
