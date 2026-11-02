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

        it('filters on today, this week and this month right away', () => {
            selectOperator(fixture, 'thisWeek');

            expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'date', type: 'thisWeek' });
            expect(params.filterChangedCallback).toHaveBeenCalledTimes(1);
        });

        it('waits for the days of today +/- days', () => {
            selectOperator(fixture, 'dayOffset');
            expect(fixture.componentInstance.getModel()).toBeUndefined();
            expect(params.filterChangedCallback).not.toHaveBeenCalled();

            enterDays(dayInputs(fixture)[0], '-1');

            expect(fixture.componentInstance.getModel()).toEqual({ filterType: 'date', type: 'dayOffset', days: -1 });
        });

        it('needs both day counts for between today +/- days', () => {
            selectOperator(fixture, 'betweenDayOffsets');
            enterDays(dayInputs(fixture)[0], '-7');
            expect(fixture.componentInstance.getModel()).toBeUndefined();

            enterDays(dayInputs(fixture)[1], '0');

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
            showParentModel(popup.componentInstance.getModel());

            (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
            expect(popup.componentInstance.getModel()).toBeNull();

            selectOperator(popup, 'today');
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
