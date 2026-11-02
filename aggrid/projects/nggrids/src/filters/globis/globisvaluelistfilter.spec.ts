import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GlobisValuelistFilter } from './globisvaluelistfilter';

// the first entries the valuelist gives without a search
const valuelistValues = () => [
    { displayValue: 'Open', realValue: 1 },
    { displayValue: 'Closed', realValue: 2 },
    { displayValue: 'Cancelled', realValue: 3 }
];
// a value after those first entries (Servoy gives at most 100 of a database valuelist): only a search finds it
const otherValues = () => [{ displayValue: 'Zeebrugge', realValue: 101 }];

function createGrid(resolvedDisplayData = true): any {
    const all = () => [...valuelistValues(), ...otherValues()];
    const valuelist = {
        filterList: (term: string) => of(term ? all().filter((v) => v.displayValue.toLowerCase().includes(term.toLowerCase())) : valuelistValues()),
        // the column valuelist is linked to the foundset: Servoy breaks when it replays a getDisplayValue answer, so the filter never asks
        getDisplayValue: () => {
            throw new Error('the filter must not ask the valuelist for display values');
        }
    };
    return {
        agGridOptions: { localeText: {} },
        getValuelistForFilter: () => valuelist,
        getColumnFormat: (): any => null,
        detectChanges: () => { /* noop */ },
        setTimeout: (fn: () => void) => fn(),
        format: (value: any) => value,
        hasValuelistResolvedDisplayData: () => resolvedDisplayData
    };
}

function popupParams(grid: any, buttons: string[] = []): any {
    return {
        context: { componentParent: grid },
        column: { getColId: () => 'status' },
        colDef: { field: 'status' },
        buttons,
        filterChangedCallback: vi.fn()
    };
}

function createFilter(params: any): ComponentFixture<GlobisValuelistFilter> {
    const fixture = TestBed.createComponent(GlobisValuelistFilter);
    fixture.componentInstance.agInit(params);
    fixture.detectChanges();
    return fixture;
}

// lets the promises of the filter (display values fetched from the valuelist) settle
async function settle(fixture: ComponentFixture<GlobisValuelistFilter>) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
}

function checkboxes(fixture: ComponentFixture<GlobisValuelistFilter>): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input[type=checkbox]'));
}

// the first checkbox is (Select All), the values follow
function clickValue(fixture: ComponentFixture<GlobisValuelistFilter>, displayValue: string) {
    const label = Array.from(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>).find((l) => l.textContent.trim() === displayValue)!;
    label.querySelector('input')!.click();
    fixture.detectChanges();
}

function selectOperator(fixture: ComponentFixture<GlobisValuelistFilter>, operator: string) {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = operator;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
}

function search(fixture: ComponentFixture<GlobisValuelistFilter>, term: string) {
    const input = fixture.nativeElement.querySelector('input[type=text]') as HTMLInputElement;
    input.value = term;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
}

function apply(fixture: ComponentFixture<GlobisValuelistFilter>) {
    (fixture.nativeElement.querySelectorAll('.ag-filter-apply-panel button')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
}

function clear(fixture: ComponentFixture<GlobisValuelistFilter>) {
    (fixture.nativeElement.querySelectorAll('.ag-filter-apply-panel button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
}

describe('GlobisValuelistFilter popup (GLR-7459)', () => {
    let params: any;
    let fixture: ComponentFixture<GlobisValuelistFilter>;

    beforeEach(() => {
        params = popupParams(createGrid());
        fixture = createFilter(params);
    });

    it('lists the valuelist values without the empty entry', () => {
        expect(checkboxes(fixture).length).toBe(4);
    });

    it('always has Apply and Clear, whatever the buttons of the column say', () => {
        expect(params.buttons).toEqual([]);
        expect(fixture.nativeElement.querySelectorAll('.ag-filter-apply-panel button').length).toBe(2);
    });

    it('lets the conditions scroll above the Apply panel when the popup does not fit in the window', () => {
        vi.useFakeTimers();
        const body = fixture.nativeElement.querySelector('.ag-filter-body-wrapper') as HTMLElement;
        body.getBoundingClientRect = () => ({ top: 300, bottom: 600 }) as DOMRect;
        body.parentElement!.getBoundingClientRect = () => ({ top: 300, bottom: 640 }) as DOMRect;

        fixture.componentInstance.afterGuiAttached();
        vi.advanceTimersByTime(0);
        fixture.detectChanges();
        vi.useRealTimers();

        expect(body.style.overflowY).toBe('auto');
        expect(body.style.maxHeight).toBe((window.innerHeight - 300 - 40 - 8) + 'px');
    });

    it('filters on all checked values on Apply', () => {
        clickValue(fixture, 'Open');
        clickValue(fixture, 'Closed');
        expect(params.filterChangedCallback).not.toHaveBeenCalled();

        apply(fixture);

        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'in', values: [1, 2], displayValues: ['Open', 'Closed'] });
        expect(params.filterChangedCallback).toHaveBeenCalledTimes(1);
    });

    it('closes the popup on Apply and on Enter in the search', () => {
        const hidePopup = vi.fn();
        fixture.componentInstance.afterGuiAttached({ hidePopup });
        clickValue(fixture, 'Open');
        apply(fixture);
        expect(hidePopup).toHaveBeenCalledTimes(1);

        clickValue(fixture, 'Closed');
        (fixture.nativeElement.querySelector('input[type=text]') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

        expect(hidePopup).toHaveBeenCalledTimes(2);
        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'in', values: [1, 2], displayValues: ['Open', 'Closed'] });
    });

    it('opens again with the applied filter', () => {
        clickValue(fixture, 'Open');
        clickValue(fixture, 'Closed');
        apply(fixture);
        clickValue(fixture, 'Cancelled');

        fixture.componentInstance.afterGuiAttached();

        expect(fixture.componentInstance.conditions[0].selected()).toEqual([1, 2]);
    });

    it('makes the model of the floating filter for one checked value', () => {
        clickValue(fixture, 'Closed');
        apply(fixture);

        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'equals', filter: 2, uiValue: 'Closed' });
    });

    it('excludes the checked values with does not equal', () => {
        selectOperator(fixture, 'notEqual');
        clickValue(fixture, 'Open');
        apply(fixture);

        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'notIn', values: [1], displayValues: ['Open'] });
    });

    it('filters on blank without a list', () => {
        selectOperator(fixture, 'blank');
        apply(fixture);

        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'blank' });
        // the only list left is the one of the second condition
        expect(checkboxes(fixture).length).toBe(4);
        expect(fixture.nativeElement.querySelectorAll('input[type=text]').length).toBe(1);
    });

    it('removes the filter when the last value is unchecked', () => {
        clickValue(fixture, 'Open');
        apply(fixture);
        clickValue(fixture, 'Open');
        apply(fixture);

        expect(fixture.componentInstance.getModel()).toBeNull();
    });

    it('removes the filter with Clear right away', () => {
        clickValue(fixture, 'Open');
        apply(fixture);

        clear(fixture);

        expect(fixture.componentInstance.getModel()).toBeNull();
        expect(params.filterChangedCallback).toHaveBeenCalledTimes(2);
    });

    it('searches the whole valuelist on the server, and keeps a checked value from a search in the list', () => {
        search(fixture, 'zee');
        expect(checkboxes(fixture).length).toBe(2);

        clickValue(fixture, 'Zeebrugge');
        apply(fixture);
        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'equals', filter: 101, uiValue: 'Zeebrugge' });

        search(fixture, '');
        const labels = Array.from(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>).map((l) => l.textContent.trim());
        expect(labels.slice(1, 3)).toEqual(['Zeebrugge', 'Open']);
        expect(checkboxes(fixture)[1].checked).toBe(true);
    });

    it('checks only the values the search shows with (Select All)', () => {
        search(fixture, 'c');
        // Closed and Cancelled: Open has no c
        expect(checkboxes(fixture).length).toBe(3);

        checkboxes(fixture)[0].click();
        apply(fixture);

        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'in', values: [2, 3], displayValues: ['Closed', 'Cancelled'] });
    });

    it('shows a saved filter', () => {
        fixture.componentInstance.setModel({ filterType: 'number', type: 'notIn', values: [2, 3] });
        fixture.detectChanges();

        expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).value).toBe('notEqual');
        expect(checkboxes(fixture).slice(0, 4).map((c) => c.checked)).toEqual([false, false, true, true]);
    });

    it('shows a saved value after the first entries with the display value kept in the filter', () => {
        fixture.componentInstance.setModel({ filterType: 'number', type: 'in', values: [1, 101], displayValues: ['Open', 'Zeebrugge'] });
        fixture.detectChanges();

        const labels = Array.from(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>).map((l) => l.textContent.trim());
        expect(labels.slice(1, 3)).toEqual(['Zeebrugge', 'Open']);
    });

    it('applies the value picked in the floating filter, and removes the filter when it is emptied', () => {
        fixture.componentInstance.onFloatingFilterChanged('equals', 'Closed');
        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'equals', filter: 2, uiValue: 'Closed' });

        fixture.componentInstance.onFloatingFilterChanged('equals', '');
        expect(fixture.componentInstance.getModel()).toBeNull();
    });
});

describe('GlobisValuelistFilter second condition (GLR-7459)', () => {
    let params: any;
    let fixture: ComponentFixture<GlobisValuelistFilter>;

    beforeEach(() => {
        params = popupParams(createGrid());
        fixture = createFilter(params);
    });

    const selects = () => Array.from(fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>);
    const radios = () => Array.from(fixture.nativeElement.querySelectorAll('input[type=radio]') as NodeListOf<HTMLInputElement>);

    function selectSecondOperator(operator: string) {
        selects()[1].value = operator;
        selects()[1].dispatchEvent(new Event('change'));
        fixture.detectChanges();
    }

    it('shows once the first condition filters', () => {
        expect(selects().length).toBe(1);
        expect(radios().length).toBe(0);

        clickValue(fixture, 'Open');

        expect(selects().length).toBe(2);
        expect(radios().length).toBe(2);
    });

    it('joins the two conditions with AND or OR', () => {
        clickValue(fixture, 'Open');
        selectSecondOperator('blank');
        apply(fixture);
        expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', operator: 'AND', conditions: [
            { filterType: 'number', type: 'equals', filter: 1, uiValue: 'Open' },
            { filterType: 'number', type: 'blank' }
        ] });

        radios()[1].click();
        apply(fixture);

        expect(fixture.componentInstance.getModel().operator).toBe('OR');
        expect(params.filterChangedCallback).toHaveBeenCalledTimes(2);
    });

    it('drops the second condition when the first one no longer filters', () => {
        clickValue(fixture, 'Open');
        selectSecondOperator('blank');
        apply(fixture);
        clickValue(fixture, 'Open');
        apply(fixture);

        expect(fixture.componentInstance.getModel()).toBeNull();
        expect(selects().length).toBe(1);
    });

    it('shows a saved combined filter', () => {
        fixture.componentInstance.setModel({ filterType: 'number', operator: 'OR', conditions: [
            { filterType: 'number', type: 'in', values: [1, 2] },
            { filterType: 'number', type: 'blank' }
        ] });
        fixture.detectChanges();

        expect(selects().map((select) => select.value)).toEqual(['equals', 'blank']);
        expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
        expect(fixture.componentInstance.conditions[0].selected()).toEqual([1, 2]);
    });
});

describe('GlobisValuelistFilter floating filter (GLR-7459)', () => {
    let fixture: ComponentFixture<GlobisValuelistFilter>;

    beforeEach(() => {
        const grid = createGrid();
        fixture = createFilter({ filterParams: popupParams(grid), column: { getColId: () => 'status' } });
    });

    async function showParentModel(model: any) {
        fixture.componentInstance.onParentModelChanged(model);
        await settle(fixture);
    }

    function inputs(): HTMLInputElement[] {
        return Array.from(fixture.nativeElement.querySelectorAll('input[type=text]'));
    }

    it('shows one value in the typeahead', async () => {
        await showParentModel({ filterType: 'number', type: 'equals', filter: 1, uiValue: 'Open' });

        expect(fixture.componentInstance.floatingSummary()).toBeNull();
        expect(inputs().length).toBe(1);
        expect(inputs()[0].value).toBe('Open');
    });

    it('shows other filters as a read-only summary', async () => {
        await showParentModel({ filterType: 'number', type: 'in', values: [1, 3] });
        expect(inputs()[1].readOnly).toBe(true);
        expect(inputs()[1].value).toBe('(2) Open, Cancelled');
        expect(inputs()[0].value).toBe('');

        await showParentModel({ filterType: 'number', type: 'notIn', values: [2] });
        expect(fixture.componentInstance.floatingSummary()).toBe('≠ Closed');

        await showParentModel({ filterType: 'number', type: 'blank' });
        expect(fixture.componentInstance.floatingSummary()).toBe('Blank');

        await showParentModel(null);
        expect(fixture.componentInstance.floatingSummary()).toBeNull();
        expect(inputs().length).toBe(1);
    });

    it('shows the display value kept in the filter of a value after the first entries of the valuelist', async () => {
        await showParentModel({ filterType: 'number', type: 'in', values: [1, 101], displayValues: ['Open', 'Zeebrugge'] });

        expect(fixture.componentInstance.floatingSummary()).toBe('(2) Open, Zeebrugge');
    });

    it('shows two conditions as a summary', async () => {
        await showParentModel({ filterType: 'number', operator: 'OR', conditions: [
            { filterType: 'number', type: 'equals', filter: 1, uiValue: 'Open' },
            { filterType: 'number', type: 'blank' }
        ] });

        expect(inputs()[1].value).toBe('Open OR Blank');
    });
});

describe('GlobisValuelistFilter clearing (GLR-7459)', () => {
    let params: any;
    let popup: ComponentFixture<GlobisValuelistFilter>;
    let fixture: ComponentFixture<GlobisValuelistFilter>;

    beforeEach(() => {
        const grid = createGrid();
        params = popupParams(grid);
        popup = createFilter(params);
        fixture = createFilter({
            filterParams: params,
            column: { getColId: () => 'status' },
            parentFilterInstance: (callback: (parent: any) => void) => callback(popup.componentInstance)
        });
    });

    // only the last created fixture stays in the document, and a detached checkbox does not fire change on click
    async function applyInPopup(...realValues: number[]) {
        realValues.forEach((realValue) => popup.componentInstance.onValueChange(popup.componentInstance.conditions[0], realValue, true));
        popup.componentInstance.onApplyFilter();
        fixture.componentInstance.onParentModelChanged(popup.componentInstance.getModel());
        await settle(fixture);
    }

    function clearButton(): HTMLButtonElement | null {
        return fixture.nativeElement.querySelector('button');
    }

    it('only shows the clear button with a filter', async () => {
        expect(clearButton()).toBeNull();

        await applyInPopup(1);
        expect(clearButton()).not.toBeNull();
    });

    it('removes the filter with the clear button', async () => {
        await applyInPopup(1, 2);

        clearButton()!.click();

        expect(popup.componentInstance.getModel()).toBeNull();
        expect(popup.componentInstance.conditions[0].selected()).toEqual([]);
    });

    it('removes the filter with Backspace or Delete on the summary', async () => {
        await applyInPopup(1, 2);
        (fixture.nativeElement.querySelector('input[readonly]') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
        expect(popup.componentInstance.getModel()).toBeNull();

        await applyInPopup(1, 2);
        (fixture.nativeElement.querySelector('input[readonly]') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
        expect(popup.componentInstance.getModel()).toBeNull();
    });

    it('removes the filter when the typeahead is emptied', async () => {
        await applyInPopup(1);
        const typeahead = fixture.nativeElement.querySelector('#filterText') as HTMLInputElement;
        expect(typeahead.value).toBe('Open');

        typeahead.value = '';
        typeahead.dispatchEvent(new Event('input'));

        expect(popup.componentInstance.getModel()).toBeNull();
    });
});

describe('GlobisValuelistFilter.doesFilterPass on a power grid (GLR-7459)', () => {
    let filter: GlobisValuelistFilter;
    const passes = (value: any) => filter.doesFilterPass({ data: { status: value } });

    beforeEach(() => {
        filter = createFilter(popupParams(createGrid(false))).componentInstance;
    });

    it('passes the checked values', () => {
        filter.setModel({ filterType: 'number', type: 'in', values: [1, 2] });
        expect([passes(1), passes('2'), passes(3), passes(null)]).toEqual([true, true, false, false]);
    });

    it('passes the other values, but not blank ones, with not in', () => {
        filter.setModel({ filterType: 'number', type: 'notIn', values: [1] });
        expect([passes(1), passes(2), passes(null)]).toEqual([false, true, false]);
    });

    it('joins two conditions with AND or OR', () => {
        filter.setModel({ filterType: 'number', operator: 'OR', conditions: [
            { filterType: 'number', type: 'equals', filter: 1 },
            { filterType: 'number', type: 'blank' }
        ] });
        expect([passes(1), passes(null), passes(2)]).toEqual([true, true, false]);

        filter.setModel({ filterType: 'number', operator: 'AND', conditions: [
            { filterType: 'number', type: 'notIn', values: [1] },
            { filterType: 'number', type: 'notIn', values: [2] }
        ] });
        expect([passes(1), passes(2), passes(3)]).toEqual([false, false, true]);
    });

    it('passes blank or filled values', () => {
        filter.setModel({ filterType: 'number', type: 'blank' });
        expect([passes(null), passes(''), passes(1)]).toEqual([true, true, false]);
        filter.setModel({ filterType: 'number', type: 'notBlank' });
        expect([passes(null), passes(1)]).toEqual([false, true]);
    });
});
