import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, DOCUMENT, Renderer2, ElementRef, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilterDirective } from './filter';
import { FormattingService, MaskFormat } from '@servoy/public';
import { createTimeMaskFormat, parseMaskedTime, toHHmm } from '../time-minutes';

let filterCount = 0;

@Component({
  selector: 'aggrid-datagrid-timefilter',
  template: `
    <div><div class="{{ !isFloating ? 'ag-filter-body-wrapper ag-simple-filter-body-wrapper' : '' }}">
      <div [hidden]="isFloating" class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select">
        <select style="width:100%;" [(ngModel)]="selectedFilterOperation" (change)="onFilterOperationChange($event, 0)">
          @for (operator of operators; track operator) {
            <option [value]="operator">{{ labels[operator] }}</option>
          }
        </select>
      </div>
      <div [hidden]="floatingText() !== null" class="ag-filter-body">
        <div class="ag-input-wrapper" [style]="isFloating ? 'align-items: center; gap: 4px;' : 'flex-direction: column; gap: 4px;'">
          @if (isFloating && floatingOperatorSymbol()) {
            <span>{{ floatingOperatorSymbol() }}</span>
          }
          <input class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" #element>
          @if (isFloating && showToInput(0)) {
            <span>–</span>
          }
          <input [hidden]="!showToInput(0)" class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;"
            type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" #elementTo>
          @if (isFloating && floatingModel) {
            <button type="button" style="border: none; background: none; padding: 0 2px; cursor: pointer;" [title]="txtClearFilter" [attr.aria-label]="txtClearFilter"
              (click)="clearFilter()">×</button>
          }
        </div>
      </div>
      @if (floatingText() !== null) {
        <div class="ag-filter-body">
          <div class="ag-input-wrapper">
            <input class="ag-filter-filter ag-input-field-input" type="text" readonly [value]="floatingText()" [title]="floatingText()" (keydown)="onSummaryKeydown($event)">
            <button type="button" style="border: none; background: none; padding: 0 2px; cursor: pointer;" [title]="txtClearFilter" [attr.aria-label]="txtClearFilter"
              (click)="clearFilter()">×</button>
          </div>
        </div>
      }
      <div [hidden]="isFloating || !showSecondCondition">
          <div class="ag-filter-condition" style="display: flex; justify-content: center; gap: 12px; padding: 4px 0;">
            <label><input type="radio" [name]="joinName" [checked]="join === 'AND'" (change)="onJoinChange('AND')"> {{ labels['andCondition'] }}</label>
            <label><input type="radio" [name]="joinName" [checked]="join === 'OR'" (change)="onJoinChange('OR')"> {{ labels['orCondition'] }}</label>
          </div>
          <div class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select">
            <select style="width:100%;" [(ngModel)]="secondFilterOperation" (change)="onFilterOperationChange($event, 1)">
              @for (operator of operators; track operator) {
                <option [value]="operator">{{ labels[operator] }}</option>
              }
            </select>
          </div>
          <div class="ag-filter-body">
            <div class="ag-input-wrapper" style="flex-direction: column; gap: 4px;">
              <input class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;"
                type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" #element2>
              <input [hidden]="!showToInput(1)" class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;"
                type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" #elementTo2>
            </div>
          </div>
      </div>
    </div>
    @if (hasApplyButton()) {
      <div class="ag-filter-apply-panel">
        <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onApplyFilter()">{{ txtApplyFilter }}</button>
        <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onClearFilter()">{{ txtClearFilter }}</button>
      </div>
    }</div>
    `,
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimeFilter extends FilterDirective {
    readonly elementToRef = viewChild<ElementRef>('elementTo');
    readonly element2Ref = viewChild<ElementRef>('element2');
    readonly elementTo2Ref = viewChild<ElementRef>('elementTo2');
    // FilterDirective no longer provides one, and this component is OnPush
    private readonly cdRef = inject(ChangeDetectorRef);

    readonly operators = ['equals', 'notEqual', 'lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual', 'inRange', 'blank', 'notBlank'];
    labels: Record<string, string> = {};
    // the radio buttons of AND / OR need a name of their own per filter
    readonly joinName = 'time-filter-join-' + (++filterCount);

    selectedFilterOperation = 'equals';
    // [GLR-7459] a second condition, joined by AND / OR, shows once the first one filters
    secondFilterOperation = 'equals';
    join: 'AND' | 'OR' = 'AND';
    showSecondCondition = false;
    // the applied filter, shown by the floating filter
    floatingModel: any = null;

    private readonly masks: MaskFormat[] = [];
    private readonly listeners: Array<() => void> = [];

    constructor(private renderer: Renderer2, private formattingService: FormattingService, @Inject(DOCUMENT) private doc: Document) {
        super();
    }

    agInit(params: any): void {
        super.agInit(params);
        const localeText = this.ngGrid.agGridOptions['localeText'] || {};
        this.labels = {
            equals: localeText['equals'] || 'Equals',
            notEqual: localeText['notEqual'] || 'Does not equal',
            lessThan: localeText['lessThan'] || 'Before',
            lessThanOrEqual: localeText['lessThanOrEqual'] || 'Before or equal',
            greaterThan: localeText['greaterThan'] || 'After',
            greaterThanOrEqual: localeText['greaterThanOrEqual'] || 'After or equal',
            inRange: localeText['inRange'] || 'Between',
            blank: localeText['blank'] || 'Blank',
            notBlank: localeText['notBlank'] || 'Not blank',
            andCondition: localeText['andCondition'] || 'AND',
            orCondition: localeText['orCondition'] || 'OR'
        };
    }

    ngAfterViewInit(): void {
        for (const input of this.allInputs()) {
            this.masks.push(new MaskFormat(createTimeMaskFormat(), this.renderer, input, this.formattingService, this.doc));
            this.listeners.push(this.renderer.listen(input, 'keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.updateSecondCondition();
                    this.onApplyFilter();
                }
            }));
            // without an Apply button the filter is also applied when the field is left
            this.listeners.push(this.renderer.listen(input, 'change', () => {
                this.updateSecondCondition();
                if (!this.hasApplyButton()) this.onApplyFilter();
            }));
        }
        if (!this.isFloating) {
            setTimeout(() => this.elementRef()!.nativeElement.focus(), 0);
        }
    }

    // the from and to input of a condition of the popup; the floating filter only has the first
    private inputs(index: number): HTMLInputElement[] {
        return index === 0 ? [this.elementRef()!.nativeElement, this.elementToRef()!.nativeElement] : [this.element2Ref()!.nativeElement, this.elementTo2Ref()!.nativeElement];
    }

    private allInputs(): HTMLInputElement[] {
        return this.isFloating ? this.inputs(0) : [...this.inputs(0), ...this.inputs(1)];
    }

    getFilterUIValue(): any {
        return this.elementRef()!.nativeElement.value;
    }

    setFilterUIValue(value: any) {
        this.elementRef()!.nativeElement.value = value ?? '';
    }

    getSecondFilterUIValue(): any {
        return this.elementToRef()!.nativeElement.value;
    }

    onApplyFilter() {
        this.normalizeInputs();
        if (this.isFloating) {
            const from = this.getFilterUIValue();
            const to = this.getSecondFilterUIValue();
            this.floatingParams.parentFilterInstance((instance: any) => instance.applyFloatingValues(from, to));
        } else {
            this.doFilter();
        }
    }

    applyFloatingValues(from: string, to: string): void {
        this.setFilterUIValue(from);
        this.elementToRef()!.nativeElement.value = to ?? '';
        this.doFilter();
    }

    // only tells the grid when the filter really changed, so Enter followed by leaving the field filters once
    doFilter() {
        const first = this.getConditionModel(0);
        const second = first ? this.getConditionModel(1) : null;
        const model = first && second ? { filterType: 'number', operator: this.join, conditions: [first, second] } : first;
        if (JSON.stringify(model) === JSON.stringify(this.model ?? null)) {
            return;
        }
        this.model = model;
        this.params.filterChangedCallback();
    }

    getConditionModel(index: number): any {
        const operator = index === 0 ? this.selectedFilterOperation : this.secondFilterOperation;
        const [from, to] = this.inputs(index);
        if (operator === 'blank' || operator === 'notBlank') {
            return { filterType: 'number', type: operator, uiValue: from.value };
        }
        const minutes = parseMaskedTime(from.value);
        if (minutes === null || Number.isNaN(minutes)) {
            return null;
        }
        const condition: Record<string, any> = { filterType: 'number', type: operator, uiValue: from.value, filter: minutes };
        if (operator === 'inRange') {
            // a range needs both times
            const minutesTo = parseMaskedTime(to.value);
            if (minutesTo === null || Number.isNaN(minutesTo)) {
                return null;
            }
            condition['filterTo'] = minutesTo;
        }
        return condition;
    }

    updateSecondCondition() {
        if (!this.isFloating) {
            this.showSecondCondition = this.getConditionModel(0) !== null;
            this.cdRef.markForCheck();
        }
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
        this.selectedFilterOperation = conditions[0]?.type ?? 'equals';
        this.secondFilterOperation = conditions[1]?.type ?? 'equals';
        this.join = model?.operator ?? 'AND';
        // the inputs only exist once the view is created
        if (this.element2Ref()) {
            for (const index of [0, 1]) {
                const [from, to] = this.inputs(index);
                const condition = conditions[index];
                from.value = condition?.filter == null ? '' : (toHHmm(condition.filter) ?? '');
                to.value = condition?.filterTo == null ? '' : (toHHmm(condition.filterTo) ?? '');
            }
            this.updateSecondCondition();
        }
        this.cdRef.markForCheck();
    }

    onParentModelChanged(parentModel: any): void {
        this.floatingModel = parentModel ?? null;
        const single = parentModel && !parentModel.operator ? parentModel : null;
        const hasValue = single && single.type !== 'blank' && single.type !== 'notBlank';
        this.setFilterUIValue(hasValue ? toHHmm(single.filter) : '');
        this.elementToRef()!.nativeElement.value = single?.type === 'inRange' ? (toHHmm(single.filterTo) ?? '') : '';
        this.cdRef.markForCheck();
    }

    floatingOperatorSymbol(): string | null {
        const model = this.floatingModel;
        return model && !model.operator ? this.getOperatorSymbol(model.type) : null;
    }

    getOperatorSymbol(operator: string): string | null {
        switch (operator) {
            case 'equals': return '=';
            case 'notEqual': return '≠';
            case 'lessThan': return '<';
            case 'lessThanOrEqual': return '≤';
            case 'greaterThan': return '>';
            case 'greaterThanOrEqual': return '≥';
            default: return null;
        }
    }

    showToInput(index: number): boolean {
        if (this.isFloating) {
            return this.floatingModel?.type === 'inRange';
        }
        return (index === 0 ? this.selectedFilterOperation : this.secondFilterOperation) === 'inRange';
    }

    // the applied filter as read-only text, when the floating filter cannot edit it: blank, not blank or two conditions
    floatingText(): string | null {
        const model = this.floatingModel;
        if (!this.isFloating || !model) {
            return null;
        }
        if (model.operator) {
            const join = model.operator === 'OR' ? this.labels['orCondition'] : this.labels['andCondition'];
            return model.conditions.map((condition: any) => this.getConditionText(condition)).join(' ' + join + ' ');
        }
        return model.type === 'blank' || model.type === 'notBlank' ? this.getConditionText(model) : null;
    }

    getConditionText(condition: any): string {
        switch (condition.type) {
            case 'blank':
            case 'notBlank':
                return this.labels[condition.type];
            case 'inRange':
                return toHHmm(condition.filter) + ' – ' + toHHmm(condition.filterTo);
            default:
                return this.getOperatorSymbol(condition.type) + ' ' + toHHmm(condition.filter);
        }
    }

    onFilterOperationChange(event: Event, index: number): void {
        const operator = (event.target as HTMLSelectElement).value;
        if (index === 0) {
            this.selectedFilterOperation = operator;
        } else {
            this.secondFilterOperation = operator;
        }
        if (operator === 'blank' || operator === 'notBlank') {
            for (const input of this.inputs(index)) {
                input.value = '';
            }
        }
        this.updateSecondCondition();
        if (!this.hasApplyButton()) {
            this.onApplyFilter();
        }
    }

    onJoinChange(join: 'AND' | 'OR') {
        this.join = join;
        if (!this.hasApplyButton()) {
            this.onApplyFilter();
        }
    }

    doesFilterPass(params: any): boolean {
        const model = this.model;
        if (!model) return true;
        const value = params?.data ? params.data[this.params.colDef.field!] : null;
        if (model.operator) {
            const passes = (condition: any) => this.conditionPasses(condition, value);
            return model.operator === 'OR' ? model.conditions.some(passes) : model.conditions.every(passes);
        }
        return this.conditionPasses(model, value);
    }

    conditionPasses(model: any, value: any): boolean {
        const isBlank = value === null || value === undefined || value === '';
        switch (model.type) {
            case 'blank': return isBlank;
            case 'notBlank': return !isBlank;
            case 'equals': return value === model.filter;
            case 'notEqual': return value !== model.filter;
            case 'lessThan': return !isBlank && value < model.filter;
            case 'lessThanOrEqual': return !isBlank && value <= model.filter;
            case 'greaterThan': return !isBlank && value > model.filter;
            case 'greaterThanOrEqual': return !isBlank && value >= model.filter;
            case 'inRange': return !isBlank && value >= model.filter && value <= model.filterTo;
            default: return true;
        }
    }

    // [GLR-7459] the clear button of the floating filter
    clearFilter() {
        this.floatingParams.parentFilterInstance((parent: any) => parent.onClearFilter());
    }

    onSummaryKeydown(event: KeyboardEvent) {
        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            this.clearFilter();
        }
    }

    // clearing removes the filter right away, there is no need to apply afterwards
    onClearFilter() {
        this.showModel(null);
        this.doFilter();
    }

    ngOnDestroy() {
        this.masks.forEach(mask => mask.destroy());
        this.listeners.forEach(unlisten => unlisten());
    }

    // shows a complete HH:mm, e.g. 13:__ becomes 13:00
    private normalizeInputs(): void {
        for (const input of this.allInputs()) {
            const minutes = parseMaskedTime(input.value);
            input.value = minutes === null ? '' : (toHHmm(minutes) ?? input.value);
        }
    }
}
