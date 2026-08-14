import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AccountGraphPage } from './account-graph.page';
import { ThemeService } from '../../core/services/theme.service';
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
    nodes: [
      { id: 'income:0', type: 'income', label: 'Receita', color: '#22C55E', x: -100, y: 0 },
      { id: 'bank:1', type: 'bank', label: 'Itaú', color: '#3B82F6', x: 0, y: 0 },
      { id: 'goal:1', type: 'goal', label: 'Viagem', color: '#8B5CF6', x: 100, y: 100, unassigned: true },
    ],
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
        itemCategoryName: 'Salário',
        customTabName: 'Brasil',
      },
      {
        from: 'bank:1',
        to: 'goal:1',
        amountBrl: 200,
        kind: 'investment',
        label: 'Aporte',
        subKind: 'goal',
        color: '#8B5CF6',
        refId: 2,
      },
    ],
    filterOptions: {
      accounts: [{ id: 1, name: 'Itaú', type: 'bank', color: '#3B82F6', nodeId: 'bank:1' }],
      categories: [{ id: 9, name: 'Salário', icon: '💰' }],
      customTabs: [{ id: 2, name: 'Brasil' }],
    },
    unassigned: [{ id: 'goal:1', label: 'Viagem' } as never],
    width: 100,
    height: 100,
    totals: { outflowBrl: 200, inflowBrl: 1000 },
  };

  async function build(withContainer = true): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AccountGraphPage, HttpClientTestingModule],
    })
      .overrideComponent(AccountGraphPage, {
        set: {
          template: withContainer ? '<div #cyContainer style="width:400px;height:400px"></div>' : '<div></div>',
          imports: [],
        },
      })
      .compileComponents();
    fixture = TestBed.createComponent(AccountGraphPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  function flushGraph(overrides: Partial<AccountFlowGraph> = {}): void {
    http
      .expectOne((r) => r.url === `${base}/accounts/flow-graph`)
      .flush({ ...graph, ...overrides });
  }

  beforeEach(async () => {
    await build(true);
    flushGraph();
  });

  afterEach(() => http.verify());

  it('loads the graph for the confirmed mode by default', () => {
    expect(component.mode()).toBe('confirmed');
    expect(component.graph()?.nodes.length).toBe(3);
    expect(component.loading()).toBeFalse();
  });

  it('clears loading on a failed request', async () => {
    fixture.destroy();
    await build(true);
    http.expectOne((r) => r.url === `${base}/accounts/flow-graph`).flush({}, { status: 500, statusText: 'Server Error' });
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
    expect(component.unassignedCount()).toBe(1);
  });

  it('only warns about unassigned nodes outside the confirmed mode', () => {
    expect(component.showUnassignedWarning()).toBeFalse();
    component.setMode('planned');
    http.expectOne((r) => r.url === `${base}/accounts/flow-graph`).flush(graph);
    expect(component.showUnassignedWarning()).toBeTrue();
  });

  it('derives available filter types from edge kind/subKind', () => {
    expect(component.availableTypes()).toEqual(['income', 'investment', 'goal']);
  });

  it('returns no available types without a loaded graph', async () => {
    fixture.destroy();
    await build(true);
    expect(component.availableTypes()).toEqual([]);
    http.expectOne((r) => r.url === `${base}/accounts/flow-graph`).flush(graph);
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

  describe('cytoscape integration', () => {
    it('builds real cytoscape nodes and edges from the graph, including the synthetic balance node', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      expect(cy).toBeDefined();
      expect(cy.nodes().length).toBeGreaterThanOrEqual(2);
      expect(cy.edges().length).toBeGreaterThanOrEqual(2);
    });

    it('does not create a cytoscape instance without a container element', async () => {
      fixture.destroy();
      await build(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((component as any).cy).toBeUndefined();
      http.expectOne((r) => r.url === `${base}/accounts/flow-graph`).flush(graph);
    });

    it('shows a tooltip and highlights connections when a node is tapped', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      cy.$id('bank:1').emit({ type: 'tap', position: { x: 10, y: 10 } });
      const tip = component.tooltip();
      expect(tip).not.toBeNull();
      expect(tip?.lines).toContain('Itaú');
      expect(cy.$id('bank:1').hasClass('highlighted')).toBeTrue();
    });

    it('labels the tooltip "Saldo" for the synthetic balance node', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      const balanceNode = cy.nodes('.balance-node').first();
      expect(balanceNode.length).toBe(1);
      balanceNode.emit({ type: 'tap', position: { x: 10, y: 10 } });
      expect(component.tooltip()?.title).toBe('Saldo');
    });

    it('shows a tooltip with route info when an edge is tapped', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      const edge = cy.getElementById('e_1_income:0_bank:1');
      expect(edge.length).toBe(1);
      edge.emit({ type: 'tap', position: { x: 10, y: 10 } });
      const tip = component.tooltip();
      expect(tip).not.toBeNull();
      expect(tip?.lines.some((l) => l.startsWith('De:'))).toBeTrue();
      expect(tip?.lines.some((l) => l.startsWith('Para:'))).toBeTrue();
      expect(tip?.lines).toContain('Salário');
      expect(tip?.lines).toContain('Brasil');
    });

    it('ignores taps on balance-link edges', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      const link = cy.edges('.balance-link').first();
      if (link.length) {
        link.emit({ type: 'tap', position: { x: 10, y: 10 } });
        expect(component.tooltip()).toBeNull();
      }
    });

    it('clears the tooltip and highlight classes when tapping the background', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      cy.$id('bank:1').emit({ type: 'tap', position: { x: 10, y: 10 } });
      expect(component.tooltip()).not.toBeNull();
      component.clearHighlight();
      expect(component.tooltip()).toBeNull();
      expect(cy.elements('.highlighted').length).toBe(0);
    });

    it('clears the tooltip on pan/zoom/grab', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      cy.$id('bank:1').emit({ type: 'tap', position: { x: 10, y: 10 } });
      expect(component.tooltip()).not.toBeNull();
      cy.emit('pan');
      expect(component.tooltip()).toBeNull();
    });

    it('updates the zoom percentage on zoom events', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      cy.zoom(2);
      cy.emit('zoom');
      expect(component.zoomPct()).toBe(200);
    });

    it('zoomIn / zoomOut / fitToCanvas drive the cytoscape viewport', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      const before = cy.zoom();
      component.zoomIn();
      expect(cy.zoom()).toBeGreaterThan(before);
      component.zoomOut();
      expect(() => component.fitToCanvas()).not.toThrow();
    });

    it('hides edges and their orphaned nodes when a type filter is active', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      component.toggleFilter('types', 'income');
      const incomeEdge = cy.getElementById('e_1_income:0_bank:1');
      const investEdge = cy.getElementById('e_2_bank:1_goal:1');
      expect(incomeEdge.visible()).toBeTrue();
      expect(investEdge.visible()).toBeFalse();
      expect(cy.$id('goal:1').visible()).toBeFalse();
      component.toggleFilter('types', 'income');
      expect(investEdge.visible()).toBeTrue();
    });

    it('shows every element again once all filters are cleared', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      component.toggleFilter('accounts', 'bank:1');
      component.clearFilters();
      expect(cy.elements().filter((e: unknown) => !(e as { visible: () => boolean }).visible()).length).toBe(0);
    });

    it('destroys the cytoscape instance on ngOnDestroy without throwing', () => {
      expect(() => fixture.destroy()).not.toThrow();
    });

    it('renders with the dark palette when the theme service reports dark mode', () => {
      TestBed.inject(ThemeService).isDark.set(true);
      component.setMode('planned');
      http.expectOne((r) => r.url === `${base}/accounts/flow-graph`).flush(graph);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      expect(cy.$id('bank:1').data('bgColor')).toBeTruthy();
    });

    it('marks a dashed edge with the dashed class', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      component.setMode('planned');
      http.expectOne((r) => r.url === `${base}/accounts/flow-graph`).flush({
        ...graph,
        edges: [{ ...graph.edges[0], dashed: true }],
      });
      expect(cy.getElementById('e_1_income:0_bank:1').hasClass('dashed')).toBeTrue();
    });

    it('falls back to an empty title when the tapped edge has no kind', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cy = (component as any).cy;
      const edge = cy.getElementById('e_1_income:0_bank:1');
      edge.removeData('kind');
      edge.emit({ type: 'tap', position: { x: 5, y: 5 } });
      expect(component.tooltip()?.title).toBe('');
    });
  });

  describe('before the graph has loaded', () => {
    it('defaults totals, unassigned count and the "Geral" tab', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [AccountGraphPage, HttpClientTestingModule],
      })
        .overrideComponent(AccountGraphPage, { set: { template: '<div></div>', imports: [] } })
        .compileComponents();
      const freshFixture = TestBed.createComponent(AccountGraphPage);
      const freshComponent = freshFixture.componentInstance;
      freshFixture.detectChanges();
      expect(freshComponent.totals()).toEqual({ inflowBrl: 0, outflowBrl: 0 });
      expect(freshComponent.unassignedCount()).toBe(0);
      expect(freshComponent.availableTabs()).toEqual([{ id: 'geral', name: 'Geral' }]);
      TestBed.inject(HttpTestingController).expectOne((r) => r.url === `${base}/accounts/flow-graph`).flush(graph);
    });
  });
});
