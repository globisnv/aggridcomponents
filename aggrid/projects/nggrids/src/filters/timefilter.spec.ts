import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ServoyPublicTestingModule } from '@servoy/public';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TimeFilter } from './timefilter';

function popupParams(): any {
    return {
        context: { componentParent: {
            agGridOptions: { localeText: {} },
            getValuelistForFilter: (): any => null,
            getColumnFormat: (): any => null,
            setTimeout: (fn: () => void) => fn()
        } },
        column: { getColId: () => 'start_time' },
        colDef: { field: 'start_time' },
        buttons: [],
        filterChangedCallback: vi.fn()
    };
}

function createFilter(params: any): ComponentFixture<TimeFilter> {
    const fixture = TestBed.createComponent(TimeFilter);
    fixture.componentInstance.agInit(params);
    fixture.detectChanges();
    return fixture;
}

describe('TimeFilter (GLR-7459)', () => {
    let params: any;
    let popup: ComponentFixture<TimeFilter>;

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [ServoyPublicTestingModule] });
        params = popupParams();
        popup = createFilter(params);
    });

    it('offers before or equal and after or equal', () => {
        const options = Array.from(popup.nativeElement.querySelectorAll('option') as NodeListOf<HTMLOptionElement>).map((option) => option.value);
        expect(options).toContain('lessThanOrEqual');
        expect(options).toContain('greaterThanOrEqual');
    });

    it('passes the times up to and from the filter time on a power grid', () => {
        const passes = (minutes: number | null) => popup.componentInstance.doesFilterPass({ data: { start_time: minutes } });

        popup.componentInstance.setModel({ filterType: 'number', type: 'lessThanOrEqual', filter: 480 });
        expect([passes(479), passes(480), passes(481), passes(null)]).toEqual([true, true, false, false]);

        popup.componentInstance.setModel({ filterType: 'number', type: 'greaterThanOrEqual', filter: 480 });
        expect([passes(479), passes(480), passes(481)]).toEqual([false, true, true]);
    });

    describe('second condition', () => {
        const selects = () => Array.from(popup.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>);
        const radios = () => Array.from(popup.nativeElement.querySelectorAll('input[type=radio]') as NodeListOf<HTMLInputElement>);
        // #element, #elementTo, #element2, #elementTo2
        const timeInputs = () => Array.from(popup.nativeElement.querySelectorAll('input[type=text]') as NodeListOf<HTMLInputElement>);
        const secondCondition = () => radios()[0].closest('.ag-filter-condition')!.parentElement as HTMLElement;

        function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
            element.value = value;
            element.dispatchEvent(new Event('change'));
            popup.detectChanges();
        }

        function apply() {
            (popup.nativeElement.querySelectorAll('.ag-filter-apply-panel button')[0] as HTMLButtonElement).click();
            popup.detectChanges();
        }

        it('always has Apply and Clear, whatever the buttons of the column say', () => {
            expect(params.buttons).toEqual([]);
            expect(popup.nativeElement.querySelectorAll('.ag-filter-apply-panel button').length).toBe(2);
        });

        it('shows once the first condition filters and joins the two with AND or OR on Apply', () => {
            change(selects()[0], 'greaterThanOrEqual');
            expect(secondCondition().hidden).toBe(true);

            change(timeInputs()[0], '08:00');
            expect(secondCondition().hidden).toBe(false);
            expect(params.filterChangedCallback).not.toHaveBeenCalled();
            apply();
            expect(popup.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'greaterThanOrEqual', uiValue: '08:00', filter: 480 });

            change(selects()[1], 'lessThanOrEqual');
            change(timeInputs()[2], '17:00');
            apply();
            expect(popup.componentInstance.getModel()).toEqual({ filterType: 'number', operator: 'AND', conditions: [
                { filterType: 'number', type: 'greaterThanOrEqual', uiValue: '08:00', filter: 480 },
                { filterType: 'number', type: 'lessThanOrEqual', uiValue: '17:00', filter: 1020 }
            ] });

            radios()[1].click();
            apply();
            expect(popup.componentInstance.getModel().operator).toBe('OR');
        });

        it('filters on Enter and closes the popup', () => {
            const hidePopup = vi.fn();
            popup.componentInstance.afterGuiAttached({ hidePopup });
            timeInputs()[0].value = '08:00';
            timeInputs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

            expect(popup.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'equals', uiValue: '08:00', filter: 480 });
            expect(hidePopup).toHaveBeenCalledTimes(1);
        });

        it('shows a saved combined filter', () => {
            popup.componentInstance.setModel({ filterType: 'number', operator: 'OR', conditions: [
                { filterType: 'number', type: 'lessThan', filter: 480 },
                { filterType: 'number', type: 'inRange', filter: 720, filterTo: 780 }
            ] });
            popup.detectChanges();

            expect(timeInputs().map((input) => input.value)).toEqual(['08:00', '', '12:00', '13:00']);
            expect(secondCondition().hidden).toBe(false);
            expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
        });

        it('passes two conditions joined with AND or OR on a power grid', () => {
            const passes = (minutes: number | null) => popup.componentInstance.doesFilterPass({ data: { start_time: minutes } });
            popup.componentInstance.setModel({ filterType: 'number', operator: 'OR', conditions: [
                { filterType: 'number', type: 'lessThan', filter: 480 },
                { filterType: 'number', type: 'blank' }
            ] });
            expect([passes(479), passes(null), passes(480)]).toEqual([true, true, false]);
        });
    });

    it('shows two conditions in the floating filter as read-only text, which Backspace removes', () => {
        const floating = createFilter({
            filterParams: params,
            column: { getColId: () => 'start_time' },
            parentFilterInstance: (callback: (parent: any) => void) => callback(popup.componentInstance)
        });
        const model = { filterType: 'number', operator: 'AND', conditions: [
            { filterType: 'number', type: 'greaterThanOrEqual', filter: 480 },
            { filterType: 'number', type: 'lessThanOrEqual', filter: 1020 }
        ] };
        popup.componentInstance.setModel(model);
        floating.componentInstance.onParentModelChanged(model);
        floating.detectChanges();

        const text = floating.nativeElement.querySelector('input[readonly]') as HTMLInputElement;
        expect(text.value).toBe('≥ 08:00 AND ≤ 17:00');

        text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
        expect(popup.componentInstance.getModel()).toBeNull();
    });

    it('shows the operator in the floating filter and removes the filter with its clear button', () => {
        const floating = createFilter({
            filterParams: params,
            column: { getColId: () => 'start_time' },
            parentFilterInstance: (callback: (parent: any) => void) => callback(popup.componentInstance)
        });
        expect(floating.nativeElement.querySelector('button')).toBeNull();

        popup.componentInstance.setModel({ filterType: 'number', type: 'greaterThanOrEqual', filter: 480, uiValue: '08:00' });
        floating.componentInstance.onParentModelChanged(popup.componentInstance.getModel());
        floating.detectChanges();
        expect(floating.nativeElement.textContent).toContain('≥');

        (floating.nativeElement.querySelector('button') as HTMLButtonElement).click();

        expect(popup.componentInstance.getModel()).toBeNull();
        expect(params.filterChangedCallback).toHaveBeenCalledTimes(1);
    });
});
