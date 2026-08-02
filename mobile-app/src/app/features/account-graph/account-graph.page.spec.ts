import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AccountGraphPage } from './account-graph.page';
import { environment } from '../../../environments/environment';
import { AccountFlowGraph } from '../../core/models/api.models';

describe('AccountGraphPage', () => {
  let fixture: ComponentFixture<AccountGraphPage>;
  let component: AccountGraphPage;
  let http: HttpTestingController;
  const base = environment.apiUrl;

  const graph: AccountFlowGraph = {
    year: 2026,
    month: 7,
    mode: 'confirmed',
    nodes: [{ id: 'bank:1', type: 'bank', label: 'Itaú', color: '#3B82F6', x: 0, y: 0 }],
    edges: [
      {
        from: 'income:0',
        to: 'bank:1',
        amountBrl: 1000,
        kind: 'income',
        label: 'Salário',
        subKind: 'income',
        color: '#22C55E',
        refId: 1,
      },
    ],
    filterOptions: {
      accounts: [{ id: 1, name: 'Itaú', type: 'bank', color: '#3B82F6', nodeId: 'bank:1' }],
      categories: [{ id: 9, name: 'Salário', icon: '💰' }],
      customTabs: [{ id: 2, name: 'Brasil' }],
    },
    unassigned: [],
    width: 100,
    height: 100,
    totals: { outflowBrl: 200, inflowBrl: 1000 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountGraphPage, HttpClientTestingModule],
    })
      .overrideComponent(AccountGraphPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(AccountGraphPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === `${base}/accounts/flow-graph`)
      .flush(graph);
  });

  afterEach(() => http.verify());

  it('loads the graph for the confirmed mode by default', () => {
    expect(component.mode()).toBe('confirmed');
    expect(component.graph()?.nodes.length).toBe(1);
    expect(component.loading()).toBeFalse();
  });

  it('does nothing when switching to the already-active mode', () => {
    component.setMode('confirmed');
    expect(component.mode()).toBe('confirmed');
    http.expectNone((r) => r.url === `${base}/accounts/flow-graph`);
  });

  it('reloads with the new mode when switching', () => {
    component.setMode('planned');
    expect(component.mode()).toBe('planned');
    const req = http.expectOne((r) => r.url === `${base}/accounts/flow-graph`);
    expect(req.request.params.get('mode')).toBe('planned');
    req.flush({ ...graph, mode: 'planned' });
  });

  it('reloads when the month or year changes', () => {
    component.onYearChange(2027);
    const yearReq = http.expectOne((r) => r.url === `${base}/accounts/flow-graph` && r.params.get('year') === '2027');
    expect(component.year()).toBe(2027);
    yearReq.flush(graph);

    component.onMonthChange(3);
    const monthReq = http.expectOne((r) => r.url === `${base}/accounts/flow-graph` && r.params.get('month') === '4');
    expect(component.month()).toBe(3);
    monthReq.flush(graph);
  });

  it('computes totals and unassigned count from the loaded graph', () => {
    expect(component.totals()).toEqual({ outflowBrl: 200, inflowBrl: 1000 });
    expect(component.unassignedCount()).toBe(0);
    expect(component.showUnassignedWarning()).toBeFalse();
  });

  it('derives available filter types from edge kind/subKind', () => {
    expect(component.availableTypes()).toEqual(['income']);
  });

  it('toggles a filter on and off', () => {
    expect(component.isFilterActive('types', 'income')).toBeFalse();
    component.toggleFilter('types', 'income');
    expect(component.isFilterActive('types', 'income')).toBeTrue();
    component.toggleFilter('types', 'income');
    expect(component.isFilterActive('types', 'income')).toBeFalse();
  });

  it('clears every filter dimension', () => {
    component.toggleFilter('types', 'income');
    component.toggleFilter('accounts', 'bank:1');
    component.clearFilters();
    expect(component.activeFilterCount()).toBe(0);
  });

  it('always includes the "Geral" bucket in available tabs', () => {
    const labels = component.availableTabs().map((t) => t.name);
    expect(labels).toEqual(['Geral', 'Brasil']);
  });
});
