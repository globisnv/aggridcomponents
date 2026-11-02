import { ChangeDetectionStrategy, Component, ElementRef, computed, signal, viewChild } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ValuelistFilter } from '../valuelistfilter';

/**
 * [GLR-7459] Valuelist filter whose popup filters on several values (in / not in) or on blank / not blank.
 * The floating filter stays the typeahead of ValuelistFilter as long as the filter is one value, otherwise it shows
 * the filter as a read-only summary.
 */
@Component({
    selector: 'aggrid-datagrid-globisvaluelistfilter',
    template: `
      @if (isFloating) {
        <div><div>
          <div class="ag-filter-body">
            <div class="ag-input-wrapper">
              <input class="ag-filter-filter ag-input-field-input" type="text" id="filterText" autocomplete="off"
                [style.display]="floatingSummary() !== null ? 'none' : null"
                [ngbTypeahead]="filterValues"
                (selectItem)="valueChanged()"
                (input)="onFloatingInput($event)"
                [resultFormatter]="resultFormatter"
                [inputFormatter]="inputFormatter"
                (focus)="focus$.next('')"
                [resultTemplate]="rt"
                [popupClass]="'ag-custom-component-popup svy-typeahead-zindex'"
                #instance="ngbTypeahead" #element>
              @if (floatingSummary() !== null) {
                <input class="ag-filter-filter ag-input-field-input" type="text" readonly [value]="floatingSummary()" [title]="floatingSummary()"
                  (keydown)="onSummaryKeydown($event)">
              }
              @if (hasFilter()) {
                <button type="button" style="border: none; background: none; padding: 0 2px; cursor: pointer;" [title]="txtClearFilter" [attr.aria-label]="txtClearFilter"
                  (click)="clearFilter()">×</button>
              }
            </div>
          </div>
        </div></div>
      } @else {
        <div><div class="ag-filter-body-wrapper ag-simple-filter-body-wrapper">
          <div class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select">
            <select style="width:100%;" [value]="operator()" (change)="onOperatorChange($event)">
              <option value="equals">{{ equals }}</option>
              <option value="notEqual">{{ notEqual }}</option>
              <option value="blank">{{ blank }}</option>
              <option value="notBlank">{{ notBlank }}</option>
            </select>
          </div>
          @if (operator() === 'equals' || operator() === 'notEqual') {
            <div class="ag-filter-body">
              <div class="ag-input-wrapper">
                <input class="ag-filter-filter ag-input-field-input" type="text" autocomplete="off" [placeholder]="searchOoo"
                  [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" #search>
              </div>
            </div>
            <div style="max-height: 250px; overflow-y: auto;">
              @if (visibleValues().length) {
                <label style="display: flex; align-items: center; gap: 4px; padding: 2px;">
                  <input type="checkbox" [checked]="allVisibleSelected()" (change)="onSelectAllChange($any($event.target).checked)">
                  <span>{{ selectAll }}</span>
                </label>
              }
              @for (item of visibleValues(); track $index) {
                <label style="display: flex; align-items: center; gap: 4px; padding: 2px;">
                  <input type="checkbox" [checked]="selectedSet().has(item.realValue)" (change)="onValueChange(item.realValue, $any($event.target).checked)">
                  <span>{{ getFormatedDisplayValue(item.displayValue) }}</span>
                </label>
              } @empty {
                <div style="padding: 2px;">{{ noMatches }}</div>
              }
            </div>
          }
        </div>
        @if (hasApplyButton()) {
          <div class="ag-filter-apply-panel">
            <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onApplyFilter()">{{ txtApplyFilter }}</button>
            <button type="button" class="ag-button ag-standard-button ag-filter-apply-panel-button" (click)="onClearFilter()">{{ txtClearFilter }}</button>
          </div>
        }</div>
      }
      <ng-template #rt let-r="result" let-t="term">
        <ngb-highlight [result]="getFormatedDisplayValue(r.displayValue)" [term]="t"></ngb-highlight>
      </ng-template>
      `,
    standalone: true,
    imports: [NgbModule],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobisValuelistFilter extends ValuelistFilter {

    readonly searchRef = viewChild<ElementRef>('search');

    equals!: string;
    notEqual!: string;
    blank!: string;
    notBlank!: string;
    selectAll!: string;
    searchOoo!: string;
    noMatches!: string;

    // the operator and the checked real values of the popup
    readonly operator = signal('equals');
    readonly selected = signal<any[]>([]);
    readonly selectedSet = computed(() => new Set(this.selected()));
    readonly searchTerm = signal('');
    readonly visibleValues = computed(() => {
      const term = this.searchTerm().toLowerCase();
      return ((this._valuelistValues() || []) as any[]).filter((item: any) => item.realValue !== null && item.realValue !== undefined
        && this.getFormatedDisplayValue(item.displayValue).toLowerCase().includes(term));
    });
    readonly allVisibleSelected = computed(() => this.visibleValues().every((item: any) => this.selectedSet().has(item.realValue)));
    // the applied filter as text, when the floating filter cannot show it as one value
    readonly floatingSummary = signal<string | null>(null);
    // whether the floating filter shows the clear button
    readonly hasFilter = signal(false);

    agInit(params: any): void {
        super.agInit(params);
        const localeText = this.ngGrid.agGridOptions['localeText'] || {};
        this.equals = localeText['equals'] || 'Equals';
        this.notEqual = localeText['notEqual'] || 'Does not equal';
        this.blank = localeText['blank'] || 'Blank';
        this.notBlank = localeText['notBlank'] || 'Not blank';
        this.selectAll = localeText['selectAll'] || '(Select All)';
        this.searchOoo = localeText['searchOoo'] || 'Search...';
        this.noMatches = localeText['noMatches'] || 'No matches';
    }

    // the popup opens with the applied filter, also when it was changed without applying it
    afterGuiAttached(): void {
      if (!this.isFloating) {
        this.showModel(this.model);
        this.searchTerm.set('');
        setTimeout(() => this.searchRef()?.nativeElement.focus(), 0);
      }
    }

    setModel(model: any): void {
      super.setModel(model);
      this.showModel(model);
    }

    showModel(model: any) {
      let operator = 'equals';
      let values: any[] = [];
      if (model) {
        switch (model.type) {
          case 'in':
            values = model.values;
            break;
          case 'notIn':
            operator = 'notEqual';
            values = model.values;
            break;
          case 'blank':
          case 'notBlank':
            operator = model.type;
            break;
          default:
            values = [model.filter];
        }
      }
      this.operator.set(operator);
      this.selected.set(values);
    }

    onOperatorChange(event: Event) {
      this.operator.set((event.target as HTMLSelectElement).value);
      this.valueChanged();
    }

    onValueChange(realValue: any, checked: boolean) {
      this.selected.set(checked ? [...this.selected(), realValue] : this.selected().filter((value) => value !== realValue));
      this.valueChanged();
    }

    onSelectAllChange(checked: boolean) {
      const visible = this.visibleValues().map((item: any) => item.realValue);
      const others = this.selected().filter((value) => !visible.includes(value));
      this.selected.set(checked ? [...others, ...visible] : others);
      this.valueChanged();
    }

    // clearing removes the filter right away, also with an Apply button, like TimeFilter
    onClearFilter() {
      this.showModel(null);
      this.searchTerm.set('');
      this.doFilter();
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

    // emptying the typeahead removes its value as filter
    onFloatingInput(event: Event) {
      if (this.hasFilter() && (event.target as HTMLInputElement).value === '') {
        this.clearFilter();
      }
    }

    // the floating filter picked one value, or emptied the field
    onFloatingFilterChanged(type: string | null, value: any) {
      const item = ((this.valuelistValues || []) as any[]).find((v: any) => value?.trim() === this.getFormatedDisplayValue(v.displayValue).trim());
      this.showModel(item && item.realValue !== null ? { type: 'equals', filter: item.realValue } : null);
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
      const operator = this.operator();
      if (operator === 'blank' || operator === 'notBlank') {
        const item = ((this.valuelistValues || []) as any[]).find((v: any) => v.realValue !== null && v.realValue !== undefined);
        // without a value the type is unknown: 'number' is only tested on null, which works on every column
        return { filterType: item ? this.getFilterType(item.realValue) : 'number', type: operator };
      }
      const values = this.selected();
      if (!values.length) {
        return null;
      }
      if (operator === 'equals' && values.length === 1) {
        // the same model the floating filter makes, so it keeps showing the value
        return { filterType: this.getFilterType(values[0]), type: 'equals', filter: values[0], uiValue: this.getDisplayValue(values[0]) };
      }
      return { filterType: this.getFilterType(values[0]), type: operator === 'equals' ? 'in' : 'notIn', values };
    }

    getFilterType(realValue: any): string {
      if (this.isRealValueUUID) {
        return 'uuid';
      }
      return isNaN(realValue) ? 'text' : 'number';
    }

    getDisplayValue(realValue: any): string {
      const item = ((this.valuelistValues || []) as any[]).find((v: any) => v.realValue === realValue);
      return item ? this.getFormatedDisplayValue(item.displayValue) : String(realValue);
    }

    // the floating filter shows one value it can edit, or a summary of the popup filter
    onParentModelChanged(parentModel: any) {
      void this.valuelistValuesDefer.promise.then(() => {
        const summary = parentModel && parentModel.type !== 'equals' ? this.getSummary(parentModel) : null;
        this.hasFilter.set(!!parentModel);
        this.floatingSummary.set(summary);
        this.setFilterUIValue(summary === null && parentModel ? parentModel.uiValue : '');
      });
    }

    getSummary(model: any): string {
      switch (model.type) {
        case 'blank':
          return this.blank;
        case 'notBlank':
          return this.notBlank;
        case 'in':
          return '(' + model.values.length + ') ' + model.values.map((value: any) => this.getDisplayValue(value)).join(', ');
        default:
          return '≠ ' + model.values.map((value: any) => this.getDisplayValue(value)).join(', ');
      }
    }

    // the power grid filters its rows here, the data grid on the server
    doesFilterPass(params: any): boolean {
      const model = this.model;
      if (!model || model.type === 'equals' || this.ngGrid.hasValuelistResolvedDisplayData()) {
        return super.doesFilterPass(params);
      }
      const value = params.data[this.params.colDef.field!];
      const isBlank = value === null || value === undefined || value === '';
      switch (model.type) {
        case 'blank':
          return isBlank;
        case 'notBlank':
          return !isBlank;
        case 'in':
          return this.containsValue(model.values, value);
        default:
          // like SQL NOT IN, a blank value does not pass
          return !isBlank && !this.containsValue(model.values, value);
      }
    }

    containsValue(values: any[], value: any): boolean {
      // on purpose with == so that "2" equals 2, like FilterDirective.doesFilterPass
      return values.some((v) => v == value);
    }
}
