import { ChangeDetectionStrategy, Component, Inject, DOCUMENT, Renderer2, ElementRef, viewChild } from '@angular/core';
import { FilterDirective } from './filter';
import { FormattingService, MaskFormat } from '@servoy/public';
import { createTimeMaskFormat, parseMaskedTime, toHHmm } from '../time-minutes';

@Component({
  selector: 'aggrid-datagrid-timefilter',
  template: `
    <div><div class="{{ !isFloating ? 'ag-filter-body-wrapper ag-simple-filter-body-wrapper' : '' }}">
      <div [hidden]="isFloating" class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select">
        <select style="width:100%;" [(ngModel)]="selectedFilterOperation" (change)="onFilterOperationChange($event)">
          <option value="equals">{{ equals }}</option>
          <option value="notEqual">{{ notEqual }}</option>
          <option value="lessThan">{{ lessThan }}</option>
          <option value="greaterThan">{{ greaterThan }}</option>
          <option value="inRange">{{ inRange }}</option>
          <option value="blank">{{ blank }}</option>
          <option value="notBlank">{{ notBlank }}</option>
        </select>
      </div>
      <div [hidden]="isFloatingBlank()" class="ag-filter-body">
        <div class="ag-input-wrapper" [style]="isFloating ? 'align-items: center; gap: 4px;' : 'flex-direction: column; gap: 4px;'">
          @if (isFloating && floatingOperatorSymbol()) {
            <span>{{ floatingOperatorSymbol() }}</span>
          }
          <input class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" #element>
          @if (isFloating && showSecondInput()) {
            <span>–</span>
          }
          <input [hidden]="!showSecondInput()" class="ag-filter-filter ag-input-field-input ag-text-field-input" style="min-width: 0; flex: 1 1 0;" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" #elementTo>
        </div>
      </div>
      @if (isFloatingBlank()) {
        <span>{{ floatingBlankText() }}</span>
      }
    </div>
    @if (hasApplyButton()) {
      <div class="ag-filter-apply-panel">
        <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onApplyFilter()">{{ txtApplyFilter }}</button>
        <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onClearFilter()">{{ txtClearFilter }}</button>
      </div>
    }</div>
    `,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimeFilter extends FilterDirective {
    readonly elementToRef = viewChild<ElementRef>('elementTo');

    equals: string;
    notEqual: string;
    lessThan: string;
    greaterThan: string;
    inRange: string;
    blank: string;
    notBlank: string;

    selectedFilterOperation = 'equals';
    // operator of the applied filter, shown by the floating filter
    floatingOperator: string = null;

    private readonly masks: MaskFormat[] = [];
    private readonly listeners: Array<() => void> = [];

    constructor(private renderer: Renderer2, private formattingService: FormattingService, @Inject(DOCUMENT) private doc: Document) {
        super();
    }

    agInit(params: any): void {
        super.agInit(params);
        const localeText = this.ngGrid.agGridOptions['localeText'] || {};
        this.equals = localeText['equals'] || 'Equals';
        this.notEqual = localeText['notEqual'] || 'Does not equal';
        this.lessThan = localeText['lessThan'] || 'Before';
        this.greaterThan = localeText['greaterThan'] || 'After';
        this.inRange = localeText['inRange'] || 'Between';
        this.blank = localeText['blank'] || 'Blank';
        this.notBlank = localeText['notBlank'] || 'Not blank';
    }

    ngAfterViewInit(): void {
        for (const input of [this.elementRef().nativeElement, this.elementToRef().nativeElement] as HTMLInputElement[]) {
            this.masks.push(new MaskFormat(createTimeMaskFormat(), this.renderer, input, this.formattingService, this.doc));
            this.listeners.push(this.renderer.listen(input, 'keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.onApplyFilter();
                }
            }));
            // without an Apply button the filter is also applied when the field is left
            this.listeners.push(this.renderer.listen(input, 'change', () => {
                if (!this.hasApplyButton()) this.onApplyFilter();
            }));
        }
        if (!this.isFloating) {
            setTimeout(() => this.elementRef().nativeElement.focus(), 0);
        }
    }

    getFilterUIValue(): any {
        return this.elementRef().nativeElement.value;
    }

    setFilterUIValue(value) {
        this.elementRef().nativeElement.value = value ?? '';
    }

    getSecondFilterUIValue(): any {
        return this.elementToRef().nativeElement.value;
    }

    getFilterRealValue(second?: boolean): any {
        if (this.selectedFilterOperation === 'blank' || this.selectedFilterOperation === 'notBlank') {
            return ' ';
        }
        const minutes = parseMaskedTime(second ? this.getSecondFilterUIValue() : this.getFilterUIValue());
        return minutes === null || Number.isNaN(minutes) ? null : minutes;
    }

    onApplyFilter() {
        this.normalizeInputs();
        if (this.isFloating) {
            const from = this.getFilterUIValue();
            const to = this.getSecondFilterUIValue();
            this.floatingParams.parentFilterInstance((instance: TimeFilter) => instance.applyFloatingValues(from, to));
        } else {
            this.doFilter();
        }
    }

    applyFloatingValues(from: string, to: string): void {
        this.setFilterUIValue(from);
        this.elementToRef().nativeElement.value = to ?? '';
        this.doFilter();
    }

    // only tells the grid when the filter really changed, so Enter followed by leaving the field filters once
    doFilter() {
        const realValue = this.getFilterRealValue();
        let model = realValue === null ? null : this.getCondition(realValue);
        if (model && model.type === 'inRange' && (model.filterTo === null || model.filterTo === undefined)) {
            model = null;
        }
        if (JSON.stringify(model) === JSON.stringify(this.model ?? null)) {
            return;
        }
        this.model = model;
        this.params.filterChangedCallback();
    }

    onParentModelChanged(parentModel: any): void {
        this.floatingOperator = parentModel?.type ?? null;
        const isRange = parentModel?.type === 'inRange';
        const hasValue = parentModel && parentModel.type !== 'blank' && parentModel.type !== 'notBlank';
        this.setFilterUIValue(hasValue ? toHHmm(parentModel.filter) : '');
        this.elementToRef().nativeElement.value = isRange ? (toHHmm(parentModel.filterTo) ?? '') : '';
        this.cdRef.markForCheck();
    }

    floatingOperatorSymbol(): string {
        switch (this.floatingOperator) {
            case 'equals': return '=';
            case 'notEqual': return '≠';
            case 'lessThan': return '<';
            case 'greaterThan': return '>';
            default: return null;
        }
    }

    showSecondInput(): boolean {
        return (this.isFloating ? this.floatingOperator : this.selectedFilterOperation) === 'inRange';
    }

    isFloatingBlank(): boolean {
        return this.isFloating && (this.floatingOperator === 'blank' || this.floatingOperator === 'notBlank');
    }

    floatingBlankText(): string {
        return this.floatingOperator === 'blank' ? this.blank : this.notBlank;
    }

    onFilterOperationChange(event: Event): void {
        this.selectedFilterOperation = (event.target as HTMLSelectElement).value;
        if (this.selectedFilterOperation === 'blank' || this.selectedFilterOperation === 'notBlank') {
            this.setFilterUIValue('');
            this.elementToRef().nativeElement.value = '';
        }
        if (!this.hasApplyButton()) {
            this.onApplyFilter();
        }
    }

    getCondition(realValue): any {
        const condition = {
            filterType: 'number',
            type: this.selectedFilterOperation,
            uiValue: this.getFilterUIValue()
        };
        if (this.selectedFilterOperation !== 'blank' && this.selectedFilterOperation !== 'notBlank') {
            condition['filter'] = realValue;
            if (this.selectedFilterOperation === 'inRange') {
                condition['filterTo'] = this.getFilterRealValue(true);
            }
        }
        return condition;
    }

    doesFilterPass(params: any): boolean {
        const model = this.model;
        if (!model) return true;
        const value = params?.data ? params.data[this.params.colDef.field] : null;
        const isBlank = value === null || value === undefined || value === '';
        switch (model.type) {
            case 'blank': return isBlank;
            case 'notBlank': return !isBlank;
            case 'equals': return value === model.filter;
            case 'notEqual': return value !== model.filter;
            case 'lessThan': return !isBlank && value < model.filter;
            case 'greaterThan': return !isBlank && value > model.filter;
            case 'inRange': return !isBlank && value >= model.filter && value <= model.filterTo;
            default: return true;
        }
    }

    // clearing removes the filter right away, there is no need to apply afterwards
    onClearFilter() {
        this.selectedFilterOperation = 'equals';
        this.setFilterUIValue('');
        this.elementToRef().nativeElement.value = '';
        this.doFilter();
        this.cdRef.markForCheck();
    }

    ngOnDestroy() {
        this.masks.forEach(mask => mask.destroy());
        this.listeners.forEach(unlisten => unlisten());
    }

    // shows a complete HH:mm, e.g. 13:__ becomes 13:00
    private normalizeInputs(): void {
        for (const input of [this.elementRef().nativeElement, this.elementToRef().nativeElement] as HTMLInputElement[]) {
            const minutes = parseMaskedTime(input.value);
            input.value = minutes === null ? '' : (toHHmm(minutes) ?? input.value);
        }
    }
}
