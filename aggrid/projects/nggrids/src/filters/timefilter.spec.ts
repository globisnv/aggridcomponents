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
