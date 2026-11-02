import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ServoyPublicService, ServoyPublicTestingModule } from '@servoy/public';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GlobisDateFilter, getRelativeDateRange } from './globisdatefilter';

const day = (date: Date) => date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear();

function createGrid(): any {
    return {
        agGridOptions: { localeText: {} },
        getValuelistForFilter: (): any => null,
        getColumn: () => ({ format: 'dd/MM/yyyy' }),
        getColumnFormat: (): any => null,
        detectChanges: () => { /* noop */ },
        setTimeout: (fn: () => void) => fn(),
        format: (value: any) => value instanceof Date ? day(value) : value,
        // the date pickers are not made in these tests
        loadCalendarLocale: () => ({ promise: new Promise(() => { /* never */ }) }),
        hasValuelistResolvedDisplayData: () => false
    };
}

function popupParams(grid: any): any {
    return {
        context: { componentParent: grid },
        column: { getColId: () => 'delivery_date' },
        colDef: { field: 'delivery_date' },
        buttons: [],
        filterChangedCallback: vi.fn()
    };
}

function createFilter(params: any): ComponentFixture<GlobisDateFilter> {
    const fixture = TestBed.createComponent(GlobisDateFilter);
    fixture.componentInstance.agInit(params);
    fixture.detectChanges();
    return fixture;
}

function selectOperator(fixture: ComponentFixture<GlobisDateFilter>, operator: string) {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = operator;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
}

function dayInputs(fixture: ComponentFixture<GlobisDateFilter>): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input[type=number]'));
}

function enterDays(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('change'));
}

function apply(fixture: ComponentFixture<GlobisDateFilter>) {
    (fixture.nativeElement.querySelectorAll('.ag-filter-apply-panel button')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
}

function pressEnter(input: HTMLInputElement) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

describe('GlobisDateFilter (GLR-7459)', () => {
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

    describe('popup', () => {
        let params: any;
        let fixture: ComponentFixture<GlobisDateFilter>;

        beforeEach(() => {
            params = popupParams(createGrid());
            fixture = createFilter(params);
        });

        it('always has Apply and Clear, whatever the buttons of the column say', () => {
            expect(params.buttons).toEqual([]);
            expect(fixture.nativeElement.querySelectorAll('.ag-filter-apply-panel button').length).toBe(2);
        });

        it('filters on today, this week and this month on Apply, and closes the popup', () => {
            const hidePopup = vi.fn();
            fixture.componentInstance.afterGuiAttached({ hidePopup });
            selectOperator(fixture, 'thisWeek');
            expect(params.filterChangedCallback).not.toHaveBeenCalled();

            apply(fixture);

            expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'date', type: 'thisWeek' });
            expect(params.filterChangedCallback).toHaveBeenCalledTimes(1);
            expect(hidePopup).toHaveBeenCalledTimes(1);
        });

        it('waits for the days of today +/- days', () => {
            selectOperator(fixture, 'dayOffset');
            apply(fixture);
            expect(fixture.componentInstance.getModel()).toBeUndefined();
            expect(params.filterChangedCallback).not.toHaveBeenCalled();

            enterDays(dayInputs(fixture)[0], '-1');
            apply(fixture);

            expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'date', type: 'dayOffset', days: -1 });
        });

        it('filters on Enter in the days', () => {
            selectOperator(fixture, 'dayOffset');
            const days = dayInputs(fixture)[0];
            days.value = '-2';
            pressEnter(days);

            expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'date', type: 'dayOffset', days: -2 });
        });

        it('filters on Enter in a date', () => {
            const date = fixture.nativeElement.querySelector('#filterText') as HTMLInputElement;
            date.value = '05/11/2026';
            pressEnter(date);

            expect(fixture.componentInstance.getModel()).toEqual(expect.objectContaining({ type: 'equals', dateFrom: '2026-11-05 00:00:00' }));
        });

        it('needs both day counts for between today +/- days', () => {
            selectOperator(fixture, 'betweenDayOffsets');
            enterDays(dayInputs(fixture)[0], '-7');
            apply(fixture);
            expect(fixture.componentInstance.getModel()).toBeUndefined();

            enterDays(dayInputs(fixture)[1], '0');
            apply(fixture);

            expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'date', type: 'betweenDayOffsets', days: -7, daysTo: 0 });
        });

        it('only shows the date input for the operators with a date', () => {
            const dateBody = () => (fixture.nativeElement.querySelector('#filterText') as HTMLElement).closest('.ag-filter-body') as HTMLElement;
            expect(dateBody().style.display).toBe('');

            selectOperator(fixture, 'today');
            expect(dateBody().style.display).toBe('none');
            expect(dayInputs(fixture).length).toBe(0);
        });

        // ngModel writes the operator into the select a microtask later
        it('shows a saved relative filter', async () => {
            fixture.componentInstance.setModel({ filterType: 'date', type: 'betweenDayOffsets', days: -7, daysTo: 0 });
            fixture.detectChanges();
            await fixture.whenStable();

            expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).value).toBe('betweenDayOffsets');
            expect(dayInputs(fixture).map((input) => input.value)).toEqual(['-7', '0']);
        });

        it('removes the filter with Clear', async () => {
            selectOperator(fixture, 'today');
            apply(fixture);
            fixture.componentInstance.onClearFilter();
            fixture.detectChanges();
            await fixture.whenStable();

            expect(fixture.componentInstance.getModel()).toBeNull();
            expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).value).toBe('equals');
        });

        it('uses the labels of the extended filter builder', () => {
            messages.set('globis.label.extended_filter_builder$operator_this_week', 'deze week');
            const translated = createFilter(popupParams(createGrid()));

            const options = Array.from(translated.nativeElement.querySelectorAll('option') as NodeListOf<HTMLOptionElement>);
            expect(options.find((option) => option.value === 'thisWeek')!.textContent.trim()).toBe('Deze week');
            expect(options.find((option) => option.value === 'today')!.textContent.trim()).toBe('Today');
        });
    });

    describe('second condition', () => {
        let params: any;
        let fixture: ComponentFixture<GlobisDateFilter>;
        const selects = () => Array.from(fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>);
        const radios = () => Array.from(fixture.nativeElement.querySelectorAll('input[type=radio]') as NodeListOf<HTMLInputElement>);
        // the block with AND / OR and the second condition
        const secondCondition = () => selects()[1].closest('.ag-picker-field')!.parentElement as HTMLElement;

        function selectSecondOperator(operator: string) {
            selects()[1].value = operator;
            selects()[1].dispatchEvent(new Event('change'));
            fixture.detectChanges();
        }

        beforeEach(() => {
            params = popupParams(createGrid());
            fixture = createFilter(params);
        });

        it('shows once the first condition filters', () => {
            expect(secondCondition().style.display).toBe('none');

            selectOperator(fixture, 'today');

            expect(secondCondition().style.display).toBe('');
        });

        it('joins the two conditions with AND or OR', () => {
            selectOperator(fixture, 'today');
            selectSecondOperator('blank');
            apply(fixture);
            expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'date', operator: 'AND', conditions: [
                { filterType: 'date', type: 'today' },
                { filterType: 'date', type: 'blank' }
            ] });

            radios()[1].click();
            apply(fixture);

            expect(fixture.componentInstance.getModel().operator).toBe('OR');
        });

        it('reads the date of the second condition', () => {
            selectOperator(fixture, 'thisMonth');
            (fixture.nativeElement.querySelector('#filterText2') as HTMLInputElement).value = '05/11/2026';
            apply(fixture);

            expect(fixture.componentInstance.getModel().conditions[1]).toEqual(expect.objectContaining(
                { type: 'equals', uiValue: '05/11/2026', dateFrom: '2026-11-05 00:00:00', dateFromMs: new Date(2026, 10, 5).getTime() }));
        });

        it('shows a saved combined filter', () => {
            fixture.componentInstance.setModel({ filterType: 'date', operator: 'OR', conditions: [
                { filterType: 'date', type: 'dayOffset', days: -1 },
                { filterType: 'date', type: 'afterDayOffset', days: 3 }
            ] });
            fixture.detectChanges();

            expect(selects().map((select) => select.value)).toEqual(['dayOffset', 'afterDayOffset']);
            expect(dayInputs(fixture).map((input) => input.value)).toEqual(['-1', '3']);
            expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
        });
    });

    describe('floating filter', () => {
        let popup: ComponentFixture<GlobisDateFilter>;
        let fixture: ComponentFixture<GlobisDateFilter>;

        beforeEach(() => {
            const grid = createGrid();
            const params = popupParams(grid);
            popup = createFilter(params);
            fixture = createFilter({
                filterParams: params,
                column: { getColId: () => 'delivery_date' },
                parentFilterInstance: (callback: (parent: any) => void) => callback(popup.componentInstance)
            });
        });

        function showParentModel(model: any) {
            fixture.componentInstance.onParentModelChanged(model);
            fixture.detectChanges();
        }

        function summaryInput(): HTMLInputElement | null {
            return fixture.nativeElement.querySelector('input[readonly]');
        }

        it('shows other filters than one date as a read-only summary', () => {
            showParentModel({ filterType: 'date', type: 'thisMonth' });
            expect(summaryInput()!.value).toBe('This month');

            showParentModel({ filterType: 'date', type: 'dayOffset', days: -1 });
            expect(summaryInput()!.value).toBe('Today -1');

            showParentModel({ filterType: 'date', type: 'beforeDayOffset', days: 3 });
            expect(summaryInput()!.value).toBe('≤ Today +3');

            showParentModel({ filterType: 'date', type: 'betweenDayOffsets', days: -7, daysTo: 0 });
            expect(summaryInput()!.value).toBe('Today -7 – Today');

            showParentModel({ filterType: 'date', type: 'lessThan', dateFromMs: new Date(2026, 10, 5).getTime() });
            expect(summaryInput()!.value).toBe('< 5/11/2026');

            showParentModel({ filterType: 'date', operator: 'OR', conditions: [{ filterType: 'date', type: 'today' }, { filterType: 'date', type: 'blank' }] });
            expect(summaryInput()!.value).toBe('Today OR Blank');
        });

        it('shows one date in the date input, with the clear button', () => {
            showParentModel({ filterType: 'date', type: 'equals', uiValue: '05/11/2026', dateFromMs: new Date(2026, 10, 5).getTime() });

            expect(summaryInput()).toBeNull();
            expect((fixture.nativeElement.querySelector('#filterText') as HTMLInputElement).value).toBe('05/11/2026');
            expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
        });

        it('has no clear button without a filter', () => {
            showParentModel(null);

            expect(fixture.nativeElement.querySelector('button')).toBeNull();
        });

        it('removes the filter with the clear button and with Backspace', () => {
            selectOperator(popup, 'today');
            popup.componentInstance.onApplyFilter();
            showParentModel(popup.componentInstance.getModel());

            (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
            expect(popup.componentInstance.getModel()).toBeNull();

            selectOperator(popup, 'today');
            popup.componentInstance.onApplyFilter();
            showParentModel(popup.componentInstance.getModel());
            summaryInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
            expect(popup.componentInstance.getModel()).toBeNull();
        });
    });

    describe('doesFilterPass on a power grid', () => {
        it('passes the dates of a relative filter', () => {
            const filter = createFilter(popupParams(createGrid())).componentInstance;
            const now = new Date();
            const passes = (value: any) => filter.doesFilterPass({ data: { delivery_date: value } });

            filter.setModel({ filterType: 'date', type: 'today' });
            expect([passes(now), passes(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)), passes(null)]).toEqual([true, false, false]);

            filter.setModel({ filterType: 'date', type: 'afterDayOffset', days: -7 });
            expect([passes(now), passes(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8))]).toEqual([true, false]);
        });

        it('joins two conditions with AND or OR', () => {
            const filter = createFilter(popupParams(createGrid())).componentInstance;
            const now = new Date();
            const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
            const passes = (value: any) => filter.doesFilterPass({ data: { delivery_date: value } });

            filter.setModel({ filterType: 'date', operator: 'OR', conditions: [{ filterType: 'date', type: 'today' }, { filterType: 'date', type: 'blank' }] });
            expect([passes(now), passes(null), passes(yesterday)]).toEqual([true, true, false]);

            filter.setModel({ filterType: 'date', operator: 'AND', conditions: [
                { filterType: 'date', type: 'afterDayOffset', days: -7 },
                { filterType: 'date', type: 'notEqual', dateFromMs: now.getTime() }
            ] });
            expect([passes(now), passes(yesterday)]).toEqual([false, true]);
        });
    });
});

describe('getRelativeDateRange (GLR-7459)', () => {
    // Wednesday 4 November 2026
    const now = new Date(2026, 10, 4, 10, 30);
    const at = (year: number, month: number, date: number, end = false) =>
        (end ? new Date(year, month, date, 23, 59, 59, 999) : new Date(year, month, date)).getTime();

    it('gives the same ranges as the extended filter builder', () => {
        expect(getRelativeDateRange({ type: 'today' }, now)).toEqual({ start: at(2026, 10, 4), end: at(2026, 10, 4, true) });
        expect(getRelativeDateRange({ type: 'thisWeek' }, now)).toEqual({ start: at(2026, 10, 2), end: at(2026, 10, 8, true) });
        expect(getRelativeDateRange({ type: 'thisMonth' }, now)).toEqual({ start: at(2026, 10, 1), end: at(2026, 10, 30, true) });
        expect(getRelativeDateRange({ type: 'dayOffset', days: -4 }, now)).toEqual({ start: at(2026, 9, 31), end: at(2026, 9, 31, true) });
        expect(getRelativeDateRange({ type: 'beforeDayOffset', days: 3 }, now)).toEqual({ start: null, end: at(2026, 10, 7) });
        expect(getRelativeDateRange({ type: 'afterDayOffset', days: -7 }, now)).toEqual({ start: at(2026, 9, 28), end: null });
        expect(getRelativeDateRange({ type: 'betweenDayOffsets', days: -7, daysTo: 0 }, now)).toEqual({ start: at(2026, 9, 28), end: at(2026, 10, 4, true) });
        expect(getRelativeDateRange({ type: 'equals' }, now)).toBeNull();
    });

    it('ends this week on Sunday', () => {
        const sunday = new Date(2026, 10, 8, 18, 0);
        expect(getRelativeDateRange({ type: 'thisWeek' }, sunday)).toEqual({ start: at(2026, 10, 2), end: at(2026, 10, 8, true) });
    });
});
