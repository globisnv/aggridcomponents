import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ServoyPublicTestingModule, ServoyApiTesting } from '@servoy/public';
import { DataGrid, DataGridColumn } from './datagrid';
import { SortChangedEvent } from 'ag-grid-community';
import { AgGridModule } from 'ag-grid-angular';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('DataGrid - onShow foundset.sort crash & init ordering (SVY-21479)', () => {
    let component: DataGrid;
    let fixture: ReturnType<typeof TestBed.createComponent<DataGrid>>;

    function makeFoundset(overrides: Record<string, any> = {}): any {
        return {
            foundsetId: 1,
            serverSize: 10,
            sortColumns: '',
            viewPort: { size: 10, startIndex: 0, rows: [] },
            addChangeListener: vi.fn().mockReturnValue(() => {}),
            removeChangeListener: vi.fn(),
            getSortColumns() { return this.sortColumns; },
            ...overrides
        };
    }

    function makeColumn(overrides: Record<string, any> = {}): DataGridColumn {
        return {
            columnid: 'col_' + Math.random().toString(36).slice(2, 8),
            ...overrides
        } as unknown as DataGridColumn;
    }

    function fakeAgGrid(): any {
        return {
            api: {
                setGridOption: vi.fn(),
                setRowCount: vi.fn(),
                applyColumnState: vi.fn(),
                getEditingCells: vi.fn().mockReturnValue([]),
                getRowGroupColumns: vi.fn().mockReturnValue([])
            },
            gridOptions: {}
        };
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ServoyPublicTestingModule, FormsModule, AgGridModule, DataGrid],
            schemas: [NO_ERRORS_SCHEMA],
            teardown: { destroyAfterEach: false }
        }).compileComponents();

        fixture = TestBed.createComponent(DataGrid);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('servoyApi', new ServoyApiTesting() as any);
        component.agGridOptions = component.agGridOptions || {} as any;
    });

    describe('AC3 - getSortModel does not throw when foundset is undefined', () => {
        it('returns an empty sort model instead of dereferencing undefined this.foundset', () => {
            expect(component.foundset).toBeUndefined();

            let result: any;
            expect(() => { result = component.getSortModel(); }).not.toThrow();
            expect(result).toEqual([]);
        });
    });

    describe('AC1 - changeListener does not crash on sortColumnsChanged with undefined foundset', () => {
        it('does not throw when isRootFoundsetLoaded is true but this.foundset is undefined and grid is not ready', () => {
            component.isRootFoundsetLoaded = true;
            component.isGridReady = false;
            component.foundset = undefined as any;

            expect(() => {
                component.changeListener({ sortColumnsChanged: { newValue: 'created_at desc', oldValue: '' } } as any);
            }).not.toThrow();
        });

        it('returns harmlessly (does not init) when grid is not ready', () => {
            const initSpy = vi.spyOn(component, 'initRootFoundset');
            component.isRootFoundsetLoaded = true;
            component.isGridReady = false;
            component.foundset = undefined as any;

            component.changeListener({ sortColumnsChanged: { newValue: 'created_at desc', oldValue: '' } } as any);

            expect(initSpy).not.toHaveBeenCalled();
            expect(component.foundset).toBeUndefined();
        });
    });

    describe('AC4 - invariant: isRootFoundsetLoaded === true implies this.foundset defined', () => {
        it('myFoundset change handler keeps isRootFoundsetLoaded false while grid not ready (this.foundset stays undefined)', () => {
            const myFoundset = makeFoundset({ viewPort: { size: 10, startIndex: 0, rows: [] } });
            fixture.componentRef.setInput('myFoundset', myFoundset);
            component.isGridReady = false;

            component.svyOnChanges({ myFoundset: { currentValue: myFoundset, previousValue: undefined } } as any);

            expect(component.foundset).toBeUndefined();
            expect(component.isRootFoundsetLoaded).toBe(!!component.foundset);
            expect(component.isRootFoundsetLoaded).toBe(false);
        });

        it('myFoundset change handler sets isRootFoundsetLoaded true once grid is ready (this.foundset assigned)', () => {
            const myFoundset = makeFoundset({ viewPort: { size: 10, startIndex: 0, rows: [] } });
            fixture.componentRef.setInput('myFoundset', myFoundset);
            (component as any).agGrid = () => fakeAgGrid();
            component.isGridReady = true;

            component.svyOnChanges({ myFoundset: { currentValue: myFoundset, previousValue: undefined } } as any);

            expect(component.foundset).toBeDefined();
            expect(component.isRootFoundsetLoaded).toBe(!!component.foundset);
            expect(component.isRootFoundsetLoaded).toBe(true);
        });
    });

    describe('AC2 - onShow sort applied after render (not just crash suppression)', () => {
        it('once the grid becomes ready and initRootFoundset runs, getSortModel returns the real (non-empty) sort model', () => {
            fixture.componentRef.setInput('columns', [
                makeColumn({ id: 'created_at', dataprovider: { idForFoundset: 'created_at' } })
            ]);
            const myFoundset = makeFoundset({ sortColumns: 'created_at desc' });
            fixture.componentRef.setInput('myFoundset', myFoundset);
            (component as any).agGrid = () => fakeAgGrid();

            expect(component.getSortModel()).toEqual([]);

            component.isGridReady = true;
            component.initRootFoundset();

            expect(component.foundset).toBeDefined();
            expect(component.getSortModel()).toEqual([{ colId: 'created_at', sort: 'desc' }]);
        });

        it('applies the foundset sort to the grid once ready (initRootFoundset pushes the model via applySortModel)', () => {
            fixture.componentRef.setInput('columns', [
                makeColumn({ id: 'created_at', dataprovider: { idForFoundset: 'created_at' } })
            ]);
            const myFoundset = makeFoundset({ sortColumns: 'created_at desc' });
            fixture.componentRef.setInput('myFoundset', myFoundset);
            (component as any).agGrid = () => fakeAgGrid();
            vi.spyOn(component, 'onSort').mockReturnValue((() => {}) as any);
            const applySortModelSpy = vi.spyOn(component, 'applySortModel').mockImplementation(() => {});

            component.isGridReady = true;
            component.initRootFoundset();

            expect(component.foundset).toBeDefined();
            expect(applySortModelSpy).toHaveBeenCalledWith([{ colId: 'created_at', sort: 'desc' }]);
        });
    });

    describe('AC4 - changeListener lazily re-inits when foundset missing but grid ready', () => {
        it('assigns this.foundset and restores the invariant when a change arrives after the grid is ready', () => {
            fixture.componentRef.setInput('columns', [
                makeColumn({ id: 'created_at', dataprovider: { idForFoundset: 'created_at' } })
            ]);
            const myFoundset = makeFoundset({ sortColumns: 'created_at desc' });
            fixture.componentRef.setInput('myFoundset', myFoundset);
            (component as any).agGrid = () => fakeAgGrid();

            component.isRootFoundsetLoaded = true;
            component.foundset = undefined as any;
            component.isGridReady = true;

            component.changeListener({ sortColumnsChanged: { newValue: 'created_at desc', oldValue: '' } } as any);

            expect(component.foundset).toBeDefined();
            expect(component.isRootFoundsetLoaded).toBe(!!component.foundset);
            expect(component.isRootFoundsetLoaded).toBe(true);
        });
    });

    describe('AC5 - ee508d76 preserved: initRootFoundset returns early when grid not ready', () => {
        it('does not assign this.foundset and does not call AG Grid API when isGridReady is false', () => {
            const grid = fakeAgGrid();
            (component as any).agGrid = () => grid;
            const myFoundset = makeFoundset();
            fixture.componentRef.setInput('myFoundset', myFoundset);
            component.isGridReady = false;

            component.initRootFoundset();

            expect(component.foundset).toBeUndefined();
            expect(grid.api.setGridOption).not.toHaveBeenCalled();
        });
    });

    describe('Non-regression - empty / newly-set foundset', () => {
        it('leaves isRootFoundsetLoaded false and this.foundset undefined for an empty foundset', () => {
            const myFoundset = makeFoundset({ serverSize: 0, viewPort: { size: 0, startIndex: 0, rows: [] } });
            fixture.componentRef.setInput('myFoundset', myFoundset);
            (component as any).agGrid = () => fakeAgGrid();
            component.isGridReady = true;

            component.svyOnChanges({ myFoundset: { currentValue: myFoundset, previousValue: undefined } } as any);

            expect(component.isRootFoundsetLoaded).toBe(false);
            expect(component.foundset).toBeUndefined();
        });
    });

    describe('AC4 - isRootFoundsetLoaded set when foundset loaded via onGridReady (grid ready after model)', () => {
        it('initRootFoundset sets isRootFoundsetLoaded true whenever this.foundset is assigned', () => {
            const myFoundset = makeFoundset({ viewPort: { size: 10, startIndex: 0, rows: [] } });
            fixture.componentRef.setInput('myFoundset', myFoundset);
            (component as any).agGrid = () => fakeAgGrid();

            component.isGridReady = false;
            component.svyOnChanges({ myFoundset: { currentValue: myFoundset, previousValue: undefined } } as any);
            expect(component.foundset).toBeUndefined();
            expect(component.isRootFoundsetLoaded).toBe(false);

            component.isGridReady = true;
            component.initRootFoundset();

            expect(component.foundset).toBeDefined();
            expect(component.isRootFoundsetLoaded).toBe(true);
        });

        it('a subsequent foundset change is processed (not dropped) after onGridReady loads the foundset', () => {
            const myFoundset = makeFoundset({ viewPort: { size: 10, startIndex: 0, rows: [] } });
            fixture.componentRef.setInput('myFoundset', myFoundset);
            (component as any).agGrid = () => fakeAgGrid();

            component.isGridReady = false;
            component.svyOnChanges({ myFoundset: { currentValue: myFoundset, previousValue: undefined } } as any);

            component.isGridReady = true;
            component.initRootFoundset();
            expect(component.isRootFoundsetLoaded).toBe(true);

            const isTableGroupedSpy = vi.spyOn(component, 'isTableGrouped').mockReturnValue(false);
            const refreshDatasourceSpy = vi.spyOn(component, 'refreshDatasource').mockImplementation(() => {});

            component.changeListener({ foundsetDefinitionChanged: { newValue: {} as any, oldValue: {} as any } } as any);

            expect(refreshDatasourceSpy).toHaveBeenCalled();
            isTableGroupedSpy.mockRestore();
            refreshDatasourceSpy.mockRestore();
        });
    });
});

describe('DataGrid - onSortChanged source guard (SVY-21291)', () => {
    let component: DataGrid;
    let onSortChanged: (event: SortChangedEvent) => void;
    let onSortHandlerSpy: ReturnType<typeof vi.spyOn>;
    let storeColumnsStateSpy: ReturnType<typeof vi.spyOn>;
    let isTableGroupedSpy: ReturnType<typeof vi.spyOn>;
    let refreshAgGridServerSideSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ServoyPublicTestingModule, FormsModule, AgGridModule, DataGrid],
            schemas: [NO_ERRORS_SCHEMA],
            teardown: { destroyAfterEach: false }
        }).compileComponents();

        const fixture = TestBed.createComponent(DataGrid);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('servoyApi', new ServoyApiTesting() as any);

        component.agGridOptions = component.agGridOptions || {} as any;

        onSortHandlerSpy = vi.spyOn(component, 'onSortHandler').mockImplementation(() => {});
        storeColumnsStateSpy = vi.spyOn(component, 'storeColumnsState').mockImplementation(() => {});
        isTableGroupedSpy = vi.spyOn(component, 'isTableGrouped').mockReturnValue(false);
        refreshAgGridServerSideSpy = vi.spyOn(component, 'refreshAgGridServerSide').mockImplementation(() => {});

        component.agGridOptions.onSortChanged = function(this: DataGrid, event: SortChangedEvent) {
            const source = (event as any).source;
            if (source === 'gridInitializing') return;

            this.storeColumnsState();

            if (this.isTableGrouped()) {
                this.removeAllFoundsetRef = true;
                this.refreshAgGridServerSide();
            }

            if (source !== 'api') {
                this.isSortModelApplied = true;
                if ((this as any).onSort?.()) {
                    this.onSortHandler();
                }
            }
        };

        onSortChanged = component.agGridOptions.onSortChanged as (event: SortChangedEvent) => void;
    });

    function enableOnSort(handler?: () => Promise<unknown>) {
        const h = handler ?? (() => Promise.resolve());
        Object.defineProperty(component, 'onSort', {
            value: () => h,
            configurable: true
        });
    }

    describe('onSortHandler guard by event.source', () => {
        it('should NOT call onSortHandler when event.source is api', () => {
            enableOnSort();

            onSortChanged.call(component, { source: 'api' } as any);

            expect(onSortHandlerSpy).not.toHaveBeenCalled();
        });

        it('should call onSortHandler when event.source is uiColumnSorted', () => {
            enableOnSort();

            onSortChanged.call(component, { source: 'uiColumnSorted' } as any);

            expect(onSortHandlerSpy).toHaveBeenCalledTimes(1);
        });

        it('should call onSortHandler when event.source is columnMenu', () => {
            enableOnSort();

            onSortChanged.call(component, { source: 'columnMenu' } as any);

            expect(onSortHandlerSpy).toHaveBeenCalledTimes(1);
        });

        it('should NOT call onSortHandler when onSort handler is not defined', () => {
            onSortChanged.call(component, { source: 'uiColumnSorted' } as any);

            expect(onSortHandlerSpy).not.toHaveBeenCalled();
        });

        it('should NOT call onSortHandler when event.source is gridInitializing', () => {
            enableOnSort();

            onSortChanged.call(component, { source: 'gridInitializing' } as any);

            expect(onSortHandlerSpy).not.toHaveBeenCalled();
        });
    });

    describe('storeColumnsState fires for all sources', () => {
        it('should call storeColumnsState when event.source is api', () => {
            onSortChanged.call(component, { source: 'api' } as any);

            expect(storeColumnsStateSpy).toHaveBeenCalledTimes(1);
        });

        it('should call storeColumnsState when event.source is uiColumnSorted', () => {
            enableOnSort();

            onSortChanged.call(component, { source: 'uiColumnSorted' } as any);

            expect(storeColumnsStateSpy).toHaveBeenCalledTimes(1);
        });

        it('should call storeColumnsState when event.source is columnMenu', () => {
            enableOnSort();

            onSortChanged.call(component, { source: 'columnMenu' } as any);

            expect(storeColumnsStateSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('grouped table refresh fires for all sources', () => {
        it('should call refreshAgGridServerSide when grouped and event.source is api', () => {
            isTableGroupedSpy.mockReturnValue(true);

            onSortChanged.call(component, { source: 'api' } as any);

            expect(refreshAgGridServerSideSpy).toHaveBeenCalledTimes(1);
            expect(component.removeAllFoundsetRef).toBe(true);
        });

        it('should call refreshAgGridServerSide when grouped and event.source is uiColumnSorted', () => {
            enableOnSort();
            isTableGroupedSpy.mockReturnValue(true);

            onSortChanged.call(component, { source: 'uiColumnSorted' } as any);

            expect(refreshAgGridServerSideSpy).toHaveBeenCalledTimes(1);
            expect(component.removeAllFoundsetRef).toBe(true);
        });

        it('should NOT call refreshAgGridServerSide when not grouped', () => {
            isTableGroupedSpy.mockReturnValue(false);

            onSortChanged.call(component, { source: 'api' } as any);

            expect(refreshAgGridServerSideSpy).not.toHaveBeenCalled();
        });
    });

    describe('isSortModelApplied flag', () => {
        it('should set isSortModelApplied to true when event.source is uiColumnSorted', () => {
            enableOnSort();
            component.isSortModelApplied = false;

            onSortChanged.call(component, { source: 'uiColumnSorted' } as any);

            expect(component.isSortModelApplied).toBe(true);
        });

        it('should set isSortModelApplied to true when event.source is columnMenu', () => {
            enableOnSort();
            component.isSortModelApplied = false;

            onSortChanged.call(component, { source: 'columnMenu' } as any);

            expect(component.isSortModelApplied).toBe(true);
        });

        it('should NOT set isSortModelApplied when event.source is api', () => {
            component.isSortModelApplied = false;

            onSortChanged.call(component, { source: 'api' } as any);

            expect(component.isSortModelApplied).toBe(false);
        });
    });

    describe('sortHandlerPromises queue integrity', () => {
        it('should not grow sortHandlerPromises when sort triggered by api source', () => {
            enableOnSort();
            component.sortHandlerPromises = [];

            onSortChanged.call(component, { source: 'api' } as any);

            expect(component.sortHandlerPromises.length).toBe(0);
        });

        it('should only add to sortHandlerPromises for UI sort, not API sort', () => {
            const sortPromise = Promise.resolve();
            enableOnSort(() => sortPromise);
            component.sortHandlerPromises = [];

            onSortHandlerSpy.mockImplementation(function(this: DataGrid) {
                this.sortHandlerPromises.push(sortPromise);
            });

            onSortChanged.call(component, { source: 'api' } as any);
            expect(component.sortHandlerPromises.length).toBe(0);

            onSortChanged.call(component, { source: 'uiColumnSorted' } as any);
            expect(component.sortHandlerPromises.length).toBe(1);
        });

        it('should keep sortHandlerPromises empty when multiple api-source events fire in rapid succession', () => {
            enableOnSort();
            component.sortHandlerPromises = [];

            onSortChanged.call(component, { source: 'api' } as any);
            onSortChanged.call(component, { source: 'api' } as any);
            onSortChanged.call(component, { source: 'api' } as any);
            onSortChanged.call(component, { source: 'api' } as any);
            onSortChanged.call(component, { source: 'api' } as any);

            expect(component.sortHandlerPromises.length).toBe(0);
            expect(onSortHandlerSpy).not.toHaveBeenCalled();
        });

        it('should not corrupt the queue when interleaved api sorts precede a single UI sort (foundset-change scenario)', () => {
            const sortPromise = Promise.resolve();
            enableOnSort(() => sortPromise);
            component.sortHandlerPromises = [];

            onSortHandlerSpy.mockImplementation(function(this: DataGrid) {
                this.sortHandlerPromises.push(sortPromise);
            });

            onSortChanged.call(component, { source: 'api' } as any);
            onSortChanged.call(component, { source: 'api' } as any);
            onSortChanged.call(component, { source: 'api' } as any);

            expect(component.sortHandlerPromises.length).toBe(0);
            expect(onSortHandlerSpy).not.toHaveBeenCalled();

            onSortChanged.call(component, { source: 'uiColumnSorted' } as any);

            expect(component.sortHandlerPromises.length).toBe(1);
            expect(onSortHandlerSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('sortHandlerPromises out-of-order resolution', () => {
        let logErrorSpy: ReturnType<typeof vi.fn>;

        function removeSortHandlerPromise(promise: unknown) {
            (component as any).removeSortHandlerPromise(promise);
        }

        beforeEach(() => {
            logErrorSpy = vi.fn();
            Object.defineProperty(component.log, 'error', { configurable: true, get: () => logErrorSpy });
            component.sortHandlerPromises = [];
        });

        it('should drain the queue without error when promises resolve out of order', () => {
            const first = Promise.resolve();
            const second = Promise.resolve();
            component.sortHandlerPromises.push(first, second);

            removeSortHandlerPromise(second);
            removeSortHandlerPromise(first);

            expect(component.sortHandlerPromises.length).toBe(0);
            expect(logErrorSpy).not.toHaveBeenCalled();
        });

        it('should drain the queue without error when a reject settles before an earlier resolve', () => {
            const first = Promise.resolve();
            const second = Promise.reject().catch(() => undefined);
            component.sortHandlerPromises.push(first, second);

            removeSortHandlerPromise(second);
            removeSortHandlerPromise(first);

            expect(component.sortHandlerPromises.length).toBe(0);
            expect(logErrorSpy).not.toHaveBeenCalled();
        });

        it('should log out of sync when a settling promise is not in the queue', () => {
            const known = Promise.resolve();
            const stray = Promise.resolve();
            component.sortHandlerPromises.push(known);

            removeSortHandlerPromise(stray);

            expect(logErrorSpy).toHaveBeenCalledWith('sortHandlerPromises out of sync');
            expect(component.sortHandlerPromises.length).toBe(1);
        });
    });
});

describe('DataGrid - headerGroupKeepColumnsTogether -> marryChildren (SVYX-1144)', () => {
    let component: DataGrid;
    let fixture: ReturnType<typeof TestBed.createComponent<DataGrid>>;

    function makeColumn(overrides: Record<string, any> = {}): DataGridColumn {
        return {
            columnid: 'col_' + Math.random().toString(36).slice(2, 8),
            ...overrides
        } as unknown as DataGridColumn;
    }

    function findGroupDef(colDefs: any[], headerName: string): any {
        return colDefs.find(def => def && def.children && def.headerName === headerName);
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ServoyPublicTestingModule, FormsModule, AgGridModule, DataGrid],
            schemas: [NO_ERRORS_SCHEMA],
            teardown: { destroyAfterEach: false }
        }).compileComponents();

        fixture = TestBed.createComponent(DataGrid);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('servoyApi', new ServoyApiTesting() as any);
    });

    it('sets marryChildren=true on the synthesized group def when the first column of the group has headerGroupKeepColumnsTogether=true', () => {
        fixture.componentRef.setInput('columns', [
            makeColumn({ columnid: 'a', headerGroup: 'G1', headerGroupKeepColumnsTogether: true }),
            makeColumn({ columnid: 'b', headerGroup: 'G1' })
        ]);

        const colDefs = component.getColumnDefs();
        const group = findGroupDef(colDefs, 'G1');

        expect(group).toBeDefined();
        expect(group.marryChildren).toBe(true);
        expect(group.children.length).toBe(2);
    });

    it('leaves marryChildren falsy when the flag is unset on the establishing column', () => {
        fixture.componentRef.setInput('columns', [
            makeColumn({ columnid: 'a', headerGroup: 'G1' }),
            makeColumn({ columnid: 'b', headerGroup: 'G1' })
        ]);

        const colDefs = component.getColumnDefs();
        const group = findGroupDef(colDefs, 'G1');

        expect(group).toBeDefined();
        expect(group.marryChildren).toBeFalsy();
    });

    it('leaves marryChildren false when the flag is explicitly false on the establishing column', () => {
        fixture.componentRef.setInput('columns', [
            makeColumn({ columnid: 'a', headerGroup: 'G1', headerGroupKeepColumnsTogether: false }),
            makeColumn({ columnid: 'b', headerGroup: 'G1' })
        ]);

        const colDefs = component.getColumnDefs();
        const group = findGroupDef(colDefs, 'G1');

        expect(group.marryChildren).toBe(false);
    });

    it('first-column-wins: a later member column setting the flag does NOT enable marryChildren', () => {
        fixture.componentRef.setInput('columns', [
            makeColumn({ columnid: 'a', headerGroup: 'G1', headerGroupKeepColumnsTogether: false }),
            makeColumn({ columnid: 'b', headerGroup: 'G1', headerGroupKeepColumnsTogether: true })
        ]);

        const colDefs = component.getColumnDefs();
        const group = findGroupDef(colDefs, 'G1');

        expect(group.marryChildren).toBe(false);
    });

    it('first-column-wins: a later member column clearing the flag does NOT disable marryChildren', () => {
        fixture.componentRef.setInput('columns', [
            makeColumn({ columnid: 'a', headerGroup: 'G1', headerGroupKeepColumnsTogether: true }),
            makeColumn({ columnid: 'b', headerGroup: 'G1', headerGroupKeepColumnsTogether: false })
        ]);

        const colDefs = component.getColumnDefs();
        const group = findGroupDef(colDefs, 'G1');

        expect(group.marryChildren).toBe(true);
    });

    it('resolves the flag independently per header group', () => {
        fixture.componentRef.setInput('columns', [
            makeColumn({ columnid: 'a', headerGroup: 'G1', headerGroupKeepColumnsTogether: true }),
            makeColumn({ columnid: 'b', headerGroup: 'G2', headerGroupKeepColumnsTogether: false })
        ]);

        const colDefs = component.getColumnDefs();

        expect(findGroupDef(colDefs, 'G1').marryChildren).toBe(true);
        expect(findGroupDef(colDefs, 'G2').marryChildren).toBe(false);
    });
});

describe('DataGrid - expand and collapse all groups (ECS-2940)', () => {
    let component: DataGrid;
    let nodes: any[];
    let purgeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ServoyPublicTestingModule, FormsModule, AgGridModule, DataGrid],
            schemas: [NO_ERRORS_SCHEMA],
            teardown: { destroyAfterEach: false }
        }).compileComponents();

        const fixture = TestBed.createComponent(DataGrid);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('servoyApi', new ServoyApiTesting() as any);

        component.agGridOptions = component.agGridOptions || {} as any;
        component.isGridReady = true;

        nodes = [
            { group: true, expanded: false, setExpanded: vi.fn() },
            { group: true, expanded: true, setExpanded: vi.fn() },
            { group: false, expanded: false, setExpanded: vi.fn() }
        ];
        vi.spyOn(component, 'isTableGrouped').mockReturnValue(true);
        purgeSpy = vi.spyOn(component, 'purge').mockImplementation(() => {});
    });

    function withApi(callback: () => void) {
        // mocked only for this call, so the grid's own lifecycle keeps the real api
        const api = { forEachNode: (nodeCallback: (node: any) => void) => nodes.forEach(nodeCallback) };
        const agGridSpy = vi.spyOn(component, 'agGrid').mockReturnValue({ api } as any);
        callback();
        agGridSpy.mockRestore();
    }

    describe('toggleAllGroups', () => {
        it('expands all groups when no group is expanded', () => {
            const expandSpy = vi.spyOn(component, 'expandAllGroups').mockImplementation(() => {});
            component.hasExpandedGroups.set(false);

            component.toggleAllGroups();

            expect(expandSpy).toHaveBeenCalled();
        });

        it('collapses all groups when a group is expanded', () => {
            const collapseSpy = vi.spyOn(component, 'collapseAllGroups').mockImplementation(() => {});
            component.hasExpandedGroups.set(true);

            component.toggleAllGroups();

            expect(collapseSpy).toHaveBeenCalled();
        });
    });

    describe('getExpandAllGroupsText', () => {
        it('names the action the button runs, from the localeText', () => {
            component.agGridOptions['localeText'] = { expandAll: 'Alles openen', collapseAll: 'Alles sluiten' };

            component.hasExpandedGroups.set(false);
            expect(component.getExpandAllGroupsText()).toBe('Alles openen');
            component.hasExpandedGroups.set(true);
            expect(component.getExpandAllGroupsText()).toBe('Alles sluiten');
        });
    });

    describe('refreshHasExpandedGroups', () => {
        it('is true while a loaded group is expanded', () => {
            withApi(() => component.refreshHasExpandedGroups());

            expect(component.hasExpandedGroups()).toBe(true);
        });

        it('is false when no loaded group is expanded', () => {
            nodes[1].expanded = false;

            withApi(() => component.refreshHasExpandedGroups());

            expect(component.hasExpandedGroups()).toBe(false);
        });
    });

    describe('placeExpandAllGroupsButton', () => {
        it('puts the button in the row group panel and back again when aggrid rebuilds the panel', async () => {
            const gridElement = document.createElement('div');
            gridElement.innerHTML = '<div class="ag-column-drop-wrapper"><div class="ag-column-drop ag-column-drop-horizontal">'
                + '<div class="ag-column-drop-title-bar"></div></div></div>';
            const button = document.createElement('button');
            vi.spyOn(component, 'agGridElementRef').mockReturnValue({ nativeElement: gridElement } as any);
            vi.spyOn(component, 'expandAllGroupsButtonRef').mockReturnValue({ nativeElement: button } as any);

            component.placeExpandAllGroupsButton();

            expect(button.parentElement!.classList.contains('ag-column-drop-title-bar')).toBe(true);
            expect(button.style.display).toBe('inline-flex');
            // the button sits next to the panel icon, not below it
            expect(button.parentElement!.style.display).toBe('flex');

            // aggrid's refreshGui replaces the title bar
            const panel = gridElement.querySelector('.ag-column-drop-horizontal')!;
            panel.innerHTML = '';
            const newTitleBar = document.createElement('div');
            newTitleBar.className = 'ag-column-drop-title-bar';
            panel.appendChild(newTitleBar);
            await new Promise((resolve) => setTimeout(resolve));

            expect(button.parentElement).toBe(newTitleBar);
            (component as any).expandAllGroupsButtonObserver.disconnect();
        });
    });

    describe('expandAllGroups', () => {
        it('expands the loaded groups that are collapsed and keeps expanding the groups that load', () => {
            withApi(() => component.expandAllGroups());

            expect(nodes[0].setExpanded).toHaveBeenCalledWith(true);
            expect(nodes[1].setExpanded).not.toHaveBeenCalled();
            expect(nodes[2].setExpanded).not.toHaveBeenCalled();
            expect(component.isExpandAllGroups).toBe(true);
            expect(component.hasExpandedGroups()).toBe(true);
        });
    });

    describe('collapseAllGroups', () => {
        it('clears the expanded state, stops expanding loaded groups and reloads the groups', () => {
            component.isExpandAllGroups = true;

            component.collapseAllGroups();

            expect(component.isExpandAllGroups).toBe(false);
            expect(component.hasExpandedGroups()).toBe(false);
            expect(component.__internalExpandedState()).toEqual({});
            expect(purgeSpy).toHaveBeenCalled();
        });
    });
});
