import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ServoyPublicService, ServoyPublicTestingModule } from '@servoy/public';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GlobisTextFilter } from './globistextfilter';

function createGrid(): any {
    return {
        agGridOptions: { localeText: {} },
        getValuelistForFilter: (): any => null,
        getColumnFormat: (): any => null,
        detectChanges: () => { /* noop */ },
        setTimeout: (fn: () => void) => fn(),
        hasValuelistResolvedDisplayData: () => false
    };
}

function popupParams(filter = 'globisTextFilter', buttons: string[] = []): any {
    return {
        context: { componentParent: createGrid() },
        column: { getColId: () => 'remark', getColDef: () => ({ filter }) },
        colDef: { field: 'remark', filter },
        buttons,
        debounceMs: 1000,
        filterChangedCallback: vi.fn()
    };
}

function createFilter(params: any): ComponentFixture<GlobisTextFilter> {
    const fixture = TestBed.createComponent(GlobisTextFilter);
    fixture.componentInstance.agInit(params);
    fixture.detectChanges();
    return fixture;
}

describe('GlobisTextFilter (GLR-7459)', () => {
    let messages: Map<string, string>;

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [ServoyPublicTestingModule] });
        messages = new Map();
        const listener = { messages: (callback: (m: Map<string, string>) => void) => {
            callback(messages);
            return listener;
        }, destroy: vi.fn() };
        vi.spyOn(TestBed.inject(ServoyPublicService), 'listenForI18NMessages').mockReturnValue(listener);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('popup', () => {
        let params: any;
        let fixture: ComponentFixture<GlobisTextFilter>;
        const selects = () => Array.from(fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>);
        const inputs = () => Array.from(fixture.nativeElement.querySelectorAll('input[type=text]') as NodeListOf<HTMLInputElement>);
        const radios = () => Array.from(fixture.nativeElement.querySelectorAll('input[type=radio]') as NodeListOf<HTMLInputElement>);

        function selectOperator(index: number, operator: string) {
            selects()[index].value = operator;
            selects()[index].dispatchEvent(new Event('change'));
            fixture.detectChanges();
        }

        function type(input: HTMLInputElement, value: string, enter = true) {
            input.value = value;
            input.dispatchEvent(new Event('input'));
            if (enter) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            fixture.detectChanges();
        }

        describe('of a text column', () => {
            beforeEach(() => {
                params = popupParams();
                fixture = createFilter(params);
            });

            it('filters on contains after the debounce of the column', () => {
                vi.useFakeTimers();
                type(inputs()[0], 'abc', false);

                vi.advanceTimersByTime(999);
                expect(params.filterChangedCallback).not.toHaveBeenCalled();
                vi.advanceTimersByTime(1);

                expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'text', type: 'contains', filter: 'abc' });
            });

            it('filters on a list of values separated by ;', () => {
                selectOperator(0, 'in');
                type(inputs()[0], 'A1; B2 ;; C3');

                expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'text', type: 'in', filter: 'A1; B2 ;; C3', values: ['A1', 'B2', 'C3'] });
            });

            it('uses the labels of the extended filter builder for the lists', () => {
                messages.set('globis.label.extended_filter_builder$operator_not_in', 'niet in');
                const translated = createFilter(popupParams());

                const option = Array.from(translated.nativeElement.querySelectorAll('option') as NodeListOf<HTMLOptionElement>).find((o) => o.value === 'notIn')!;
                expect(option.textContent.trim()).toBe('Niet in');
            });

            it('joins a second condition with AND or OR once the first one filters', () => {
                expect(selects().length).toBe(1);
                selectOperator(0, 'startsWith');
                type(inputs()[0], 'ab');
                expect(selects().length).toBe(2);

                selectOperator(1, 'blank');
                expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'text', operator: 'AND', conditions: [
                    { filterType: 'text', type: 'startsWith', filter: 'ab' },
                    { filterType: 'text', type: 'blank' }
                ] });

                radios()[1].click();
                expect(fixture.componentInstance.getModel().operator).toBe('OR');
            });

            it('shows a saved combined filter', () => {
                fixture.componentInstance.setModel({ filterType: 'text', operator: 'OR', conditions: [
                    { filterType: 'text', type: 'endsWith', filter: 'xyz' },
                    { filterType: 'text', type: 'notBlank' }
                ] });
                fixture.detectChanges();

                expect(selects().map((select) => select.value)).toEqual(['endsWith', 'notBlank']);
                expect(inputs()[0].value).toBe('xyz');
                expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
            });

            it('removes the filter with Clear, also with an Apply button', () => {
                const withApply = popupParams('globisTextFilter', ['apply', 'clear']);
                fixture = createFilter(withApply);
                type(inputs()[0], 'abc', false);
                expect(withApply.filterChangedCallback).not.toHaveBeenCalled();
                (fixture.nativeElement.querySelector('.ag-filter-apply-panel button') as HTMLButtonElement).click();
                expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'text', type: 'contains', filter: 'abc' });

                (fixture.nativeElement.querySelectorAll('.ag-filter-apply-panel button')[1] as HTMLButtonElement).click();

                expect(fixture.componentInstance.getModel()).toBeNull();
            });
        });

        describe('of a number column', () => {
            beforeEach(() => {
                params = popupParams('globisNumberFilter');
                fixture = createFilter(params);
            });

            it('filters on equals with a decimal comma or point', () => {
                type(inputs()[0], '1,5');
                expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'equals', filter: 1.5 });

                type(inputs()[0], 'abc');
                expect(fixture.componentInstance.getModel()).toBeNull();
            });

            it('needs both numbers for between', () => {
                selectOperator(0, 'inRange');
                type(inputs()[0], '10');
                expect(fixture.componentInstance.getModel()).toBeUndefined();

                type(inputs()[1], '20');

                expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'inRange', filter: 10, filterTo: 20 });
            });

            it('filters on a list of numbers and skips what is no number', () => {
                selectOperator(0, 'notIn');
                type(inputs()[0], '1; 2,5; x');

                expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'number', type: 'notIn', filter: '1; 2,5; x', values: [1, 2.5] });
            });
        });
    });

    describe('floating filter', () => {
        let popup: ComponentFixture<GlobisTextFilter>;
        let fixture: ComponentFixture<GlobisTextFilter>;
        let params: any;

        function createPair(filter: string) {
            params = popupParams(filter);
            popup = createFilter(params);
            fixture = createFilter({
                filterParams: params,
                column: params.column,
                parentFilterInstance: (callback: (parent: any) => void) => callback(popup.componentInstance)
            });
        }

        function showParentModel(model: any) {
            fixture.componentInstance.onParentModelChanged(model);
            fixture.detectChanges();
        }

        const typeahead = () => fixture.nativeElement.querySelector('input:not([readonly])') as HTMLInputElement;
        const summary = () => fixture.nativeElement.querySelector('input[readonly]') as HTMLInputElement | null;

        it('filters on contains while typing, after the debounce', () => {
            createPair('globisTextFilter');
            vi.useFakeTimers();
            typeahead().value = 'ab';
            typeahead().dispatchEvent(new Event('input'));
            vi.advanceTimersByTime(1000);

            expect(popup.componentInstance.getModel()).toEqual({ filterType: 'text', type: 'contains', filter: 'ab' });
        });

        it('shows contains as an editable value, other filters as a summary', () => {
            createPair('globisTextFilter');
            showParentModel({ filterType: 'text', type: 'contains', filter: 'ab' });
            expect(summary()).toBeNull();
            expect(typeahead().value).toBe('ab');
            expect(fixture.nativeElement.querySelector('button')).not.toBeNull();

            showParentModel({ filterType: 'text', type: 'startsWith', filter: 'ab' });
            expect(summary()!.value).toBe('Begins with ab');

            showParentModel({ filterType: 'text', operator: 'OR', conditions: [
                { filterType: 'text', type: 'in', values: ['A1', 'B2'] },
                { filterType: 'text', type: 'blank' }
            ] });
            expect(summary()!.value).toBe('(2) A1, B2 OR Blank');

            showParentModel(null);
            expect(summary()).toBeNull();
            expect(fixture.nativeElement.querySelector('button')).toBeNull();
        });

        it('shows the operator of a number', () => {
            createPair('globisNumberFilter');
            showParentModel({ filterType: 'number', type: 'greaterThanOrEqual', filter: 5 });
            expect(summary()!.value).toBe('≥ 5');

            showParentModel({ filterType: 'number', type: 'equals', filter: 5 });
            expect(typeahead().value).toBe('5');
        });

        it('removes the filter with the clear button and with Backspace', () => {
            createPair('globisTextFilter');
            popup.componentInstance.setModel({ filterType: 'text', type: 'startsWith', filter: 'ab' });
            showParentModel(popup.componentInstance.getModel());
            summary()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
            expect(popup.componentInstance.getModel()).toBeNull();

            popup.componentInstance.setModel({ filterType: 'text', type: 'contains', filter: 'ab' });
            showParentModel(popup.componentInstance.getModel());
            (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
            expect(popup.componentInstance.getModel()).toBeNull();
        });
    });

    describe('doesFilterPass on a power grid', () => {
        it('compares text case-insensitively and numbers as numbers', () => {
            const text = createFilter(popupParams()).componentInstance;
            const passesText = (value: any) => text.doesFilterPass({ data: { remark: value } });
            text.setModel({ filterType: 'text', operator: 'OR', conditions: [
                { filterType: 'text', type: 'startsWith', filter: 'AB' },
                { filterType: 'text', type: 'in', values: ['x1', 'Y2'] }
            ] });
            expect([passesText('abc'), passesText('X1'), passesText('cab'), passesText(null)]).toEqual([true, true, false, false]);

            const number = createFilter(popupParams('globisNumberFilter')).componentInstance;
            const passesNumber = (value: any) => number.doesFilterPass({ data: { remark: value } });
            number.setModel({ filterType: 'number', operator: 'AND', conditions: [
                { filterType: 'number', type: 'greaterThanOrEqual', filter: 5 },
                { filterType: 'number', type: 'notIn', values: [7] }
            ] });
            expect([passesNumber(5), passesNumber(7), passesNumber(4), passesNumber(null)]).toEqual([true, false, false, false]);
        });
    });
});
