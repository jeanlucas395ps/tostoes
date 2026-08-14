import { Component, inject, signal, computed, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import cytoscape, { Core, ElementDefinition, EventObject, StylesheetJson } from 'cytoscape';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import dagre from 'cytoscape-dagre';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonButtons,
  IonBackButton,
} from '@ionic/angular/standalone';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { ThemeService } from '../../core/services/theme.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { AccountFlowGraph, AccountFlowGraphMode } from '../../core/models/api.models';
import { nodeTypeLabel, nodeDisplayName } from '../../core/utils/account-labels.util';
import { categoryLucideNodes } from '../../core/utils/category-icon.util';
import { LucideSvgComponent } from '../../shared/components/lucide-svg/lucide-svg.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import type { IconNode } from 'lucide';
import {
  GraphFilterState,
  computeBalanceNodes,
  edgeMatchesFilters,
  hasActiveFilters,
  nodeColors,
  buildAmountLabel,
} from '../../core/utils/account-graph-mapping.util';

cytoscape.use(dagre);

interface Tooltip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

const MODE_OPTIONS: { value: AccountFlowGraphMode; label: string }[] = [
  { value: 'confirmed', label: 'Real' },
  { value: 'planned', label: 'Previsto' },
  { value: 'current', label: 'Mês atual' },
];

@Component({
  selector: 'app-account-graph',
  standalone: true,
  imports: [
    CurrencyBrlPipe,
    MonthNavComponent,
    LucideSvgComponent,
    SkeletonComponent,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    IonButtons,
    IonBackButton,
  ],
  templateUrl: './account-graph.page.html',
  styleUrl: './account-graph.page.scss',
})
export class AccountGraphPage implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(FinanceApiService);
  private theme = inject(ThemeService);

  @ViewChild('cyContainer') cyContainerRef?: ElementRef<HTMLDivElement>;

  readonly modeOptions = MODE_OPTIONS;

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  mode = signal<AccountFlowGraphMode>('confirmed');
  graph = signal<AccountFlowGraph | null>(null);
  loading = signal(true);
  showFilters = signal(false);
  zoomPct = signal(100);
  tooltip = signal<Tooltip | null>(null);

  filterTypes = signal<Set<string>>(new Set());
  filterAccounts = signal<Set<string>>(new Set());
  filterCategories = signal<Set<string>>(new Set());
  filterTabs = signal<Set<string>>(new Set());

  private cy?: Core;
  private fitTimeout?: ReturnType<typeof setTimeout>;

  totals = computed(() => this.graph()?.totals ?? { inflowBrl: 0, outflowBrl: 0 });
  unassignedCount = computed(() => this.graph()?.unassigned?.length ?? 0);
  showUnassignedWarning = computed(() => this.mode() !== 'confirmed' && this.unassignedCount() > 0);

  availableAccounts = computed(() => this.graph()?.filterOptions?.accounts ?? []);
  availableCategories = computed(() => this.graph()?.filterOptions?.categories ?? []);
  lucideFor = (icon: string | null | undefined): IconNode => categoryLucideNodes(icon);
  availableTabs = computed(() => [{ id: 'geral', name: 'Geral' }, ...(this.graph()?.filterOptions?.customTabs ?? [])]);
  availableTypes = computed(() => {
    const g = this.graph();
    if (!g) return [];
    const set = new Set<string>();
    for (const e of g.edges) {
      set.add(e.kind);
      set.add(e.subKind);
    }
    return Array.from(set);
  });

  activeFilterCount = computed(
    () =>
      this.filterTypes().size + this.filterAccounts().size + this.filterCategories().size + this.filterTabs().size
  );

  ngOnInit(): void {
    this.load();
  }

  ngAfterViewInit(): void {
    this.initCy();
  }

  ngOnDestroy(): void {
    clearTimeout(this.fitTimeout);
    this.cy?.destroy();
  }

  private initCy(): void {
    const el = this.cyContainerRef?.nativeElement;
    if (!el) return;
    this.cy = cytoscape({
      container: el,
      style: CY_STYLE,
      layout: { name: 'preset' },
      zoomingEnabled: true,
      userZoomingEnabled: true,
      panningEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      selectionType: 'single',
      minZoom: 0.15,
      maxZoom: 4,
    });
    this.cy.on('tap', 'node', (evt) => this.onNodeTap(evt));
    this.cy.on('tap', 'edge', (evt) => this.onEdgeTap(evt));
    this.cy.on('tap', (evt) => {
      if (evt.target === this.cy) this.clearHighlight();
    });
    this.cy.on('pan zoom grab', () => this.tooltip.set(null));
    this.cy.on('zoom', () => this.zoomPct.set(Math.round((this.cy?.zoom() ?? 1) * 100)));
    if (this.graph()) this.renderGraph();
  }

  load(): void {
    this.loading.set(true);
    this.api.getAccountFlowGraph(this.year(), this.month() + 1, this.mode()).subscribe({
      next: (g) => {
        this.graph.set(g);
        this.loading.set(false);
        this.renderGraph();
      },
      error: () => this.loading.set(false),
    });
  }

  setMode(m: AccountFlowGraphMode): void {
    if (m === this.mode()) return;
    this.mode.set(m);
    this.load();
  }

  onYearChange(y: number): void {
    this.year.set(y);
    this.load();
  }

  onMonthChange(m: number): void {
    this.month.set(m);
    this.load();
  }

  private renderGraph(): void {
    if (!this.cy) return;
    const g = this.graph();
    if (!g) return;
    const theme = this.theme.isDark() ? 'dark' : 'light';

    const elements: ElementDefinition[] = [];
    for (const n of g.nodes) {
      const c = nodeColors(n.type, theme, n.color);
      elements.push({
        data: {
          id: n.id,
          label: `${nodeTypeLabel(n.type, n.unassigned)}\n${nodeDisplayName(n.label, n.label)}`,
          bgColor: c.bgColor,
          borderColor: c.borderColor,
          textColor: c.textColor,
        },
        classes: n.unassigned ? 'unassigned' : undefined,
        position: { x: n.x, y: n.y },
      });
    }
    for (const e of g.edges) {
      elements.push({
        data: {
          id: `e_${e.refId}_${e.from}_${e.to}`,
          source: e.from,
          target: e.to,
          amountLabel: buildAmountLabel(e.amountBrl),
          color: e.color,
          kind: e.kind,
          subKind: e.subKind,
          itemCategoryId: e.itemCategoryId ?? null,
          customTabId: e.customTabId ?? null,
        },
        classes: e.dashed ? 'dashed' : undefined,
      });
    }

    const { balanceNodes, balanceLinks } = computeBalanceNodes(g.nodes, g.edges, g.totals);
    const balanceColors = nodeColors('balance', theme);
    for (const b of balanceNodes) {
      elements.push({
        data: {
          id: b.id,
          label: `SALDO\n${b.label}`,
          bgColor: balanceColors.bgColor,
          borderColor: balanceColors.borderColor,
          textColor: balanceColors.textColor,
        },
        classes: 'balance-node',
      });
    }
    for (const link of balanceLinks) {
      elements.push({ data: { id: `bal_${link.from}_${link.to}`, source: link.from, target: link.to }, classes: 'balance-link' });
    }

    this.cy.elements().remove();
    this.cy.add(elements);
    const layout = this.cy.layout({
      name: 'dagre',
      rankDir: 'TB',
      rankSep: 100,
      nodeSep: 36,
      edgeSep: 20,
      padding: 36,
      animate: true,
      animationDuration: 500,
      animationEasing: 'ease-in-out-cubic',
      fit: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    layout.run();
    clearTimeout(this.fitTimeout);
    this.fitTimeout = setTimeout(() => {
      this.cy?.fit(undefined, 36);
      this.applyFilters();
    }, 560);
  }

  private currentFilters(): GraphFilterState {
    return {
      types: this.filterTypes(),
      accounts: this.filterAccounts(),
      categories: this.filterCategories(),
      tabs: this.filterTabs(),
    };
  }

  toggleFilter(kind: 'types' | 'accounts' | 'categories' | 'tabs', value: string): void {
    const sig = { types: this.filterTypes, accounts: this.filterAccounts, categories: this.filterCategories, tabs: this.filterTabs }[
      kind
    ];
    const next = new Set(sig());
    if (next.has(value)) next.delete(value);
    else next.add(value);
    sig.set(next);
    this.applyFilters();
  }

  isFilterActive(kind: 'types' | 'accounts' | 'categories' | 'tabs', value: string): boolean {
    return { types: this.filterTypes, accounts: this.filterAccounts, categories: this.filterCategories, tabs: this.filterTabs }[
      kind
    ]().has(value);
  }

  clearFilters(): void {
    this.filterTypes.set(new Set());
    this.filterAccounts.set(new Set());
    this.filterCategories.set(new Set());
    this.filterTabs.set(new Set());
    this.applyFilters();
  }

  /** cytoscape.js expõe show()/hide()/visible() em runtime; os tipos publicados
   * do pacote não os declaram, por isso os casts pontuais abaixo. */
  private applyFilters(): void {
    if (!this.cy) return;
    const filters = this.currentFilters();
    if (!hasActiveFilters(filters)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.cy.elements() as any).show();
      return;
    }
    const g = this.graph();
    if (!g) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.cy.edges().forEach((edge: any) => {
      if (edge.hasClass('balance-link')) return;
      const model = g.edges.find((e) => `e_${e.refId}_${e.from}_${e.to}` === edge.id());
      if (!model) return;
      if (edgeMatchesFilters(model, filters)) edge.show();
      else edge.hide();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.cy.nodes().forEach((node: any) => {
      if (node.hasClass('balance-node')) return;
      const hasVisibleEdge = node
        .connectedEdges()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((e: any) => !e.hasClass('balance-link'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .some((e: any) => e.visible());
      if (hasVisibleEdge) node.show();
      else node.hide();
    });
  }

  fitToCanvas(): void {
    this.cy?.fit(undefined, 36);
  }

  zoomIn(): void {
    this.zoomBy(1.3);
  }

  zoomOut(): void {
    this.zoomBy(1 / 1.3);
  }

  private zoomBy(factor: number): void {
    if (!this.cy) return;
    const level = this.cy.zoom() * factor;
    const w = this.cyContainerRef?.nativeElement.clientWidth ?? 0;
    const h = this.cyContainerRef?.nativeElement.clientHeight ?? 0;
    this.cy.zoom({ level, renderedPosition: { x: w / 2, y: h / 2 } });
  }

  private onNodeTap(evt: EventObject): void {
    const node = evt.target;
    this.cy?.elements().removeClass('highlighted').addClass('dimmed');
    node.removeClass('dimmed').addClass('highlighted');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.connectedEdges().forEach((e: any) => {
      e.removeClass('dimmed').addClass('highlighted');
      e.connectedNodes().removeClass('dimmed').addClass('highlighted');
    });
    const pos = evt.renderedPosition ?? evt.position;
    const isBalance = node.hasClass('balance-node');
    this.tooltip.set({
      x: pos.x + 14,
      y: pos.y - 8,
      title: isBalance ? 'Saldo' : nodeTypeLabel(this.rawType(node.id()), node.hasClass('unassigned')),
      lines: [nodeDisplayName(node.data('label'), node.id())],
    });
  }

  private onEdgeTap(evt: EventObject): void {
    const edge = evt.target;
    if (edge.hasClass('balance-link')) return;
    const g = this.graph();
    const model = g?.edges.find((e) => `e_${e.refId}_${e.from}_${e.to}` === edge.id());
    const pos = evt.renderedPosition ?? evt.position;
    const lines = [edge.data('amountLabel') as string];
    if (model) {
      lines.push(`De: ${nodeDisplayName(this.cy?.getElementById(model.from).data('label'), model.from)}`);
      lines.push(`Para: ${nodeDisplayName(this.cy?.getElementById(model.to).data('label'), model.to)}`);
      if (model.itemCategoryName) lines.push(model.itemCategoryName);
      if (model.customTabName) lines.push(model.customTabName);
    }
    this.tooltip.set({ x: pos.x + 14, y: pos.y - 8, title: edge.data('kind') ?? '', lines });
  }

  private rawType(nodeId: string): string {
    return this.graph()?.nodes.find((n) => n.id === nodeId)?.type ?? 'unassigned';
  }

  clearHighlight(): void {
    this.cy?.elements().removeClass('highlighted dimmed');
    this.tooltip.set(null);
  }
}

const CY_STYLE: StylesheetJson = [
  {
    selector: 'node',
    style: {
      shape: 'round-rectangle',
      width: 156,
      height: 60,
      'background-color': 'data(bgColor)',
      'border-color': 'data(borderColor)',
      'border-width': 1.5,
      label: 'data(label)',
      'font-family': 'Public Sans, sans-serif',
      'font-size': 11,
      'font-weight': 600,
      color: 'data(textColor)',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '136px',
    },
  },
  { selector: 'node.highlighted', style: { 'border-width': 2.5 } },
  { selector: 'node[?unassigned]', style: { 'border-style': 'dashed', opacity: 0.7 } },
  { selector: 'node.dimmed', style: { opacity: 0.18 } },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'line-color': 'data(color)',
      'target-arrow-color': 'data(color)',
      width: 1.75,
      'line-opacity': 0.7,
      label: 'data(amountLabel)',
      'font-family': 'JetBrains Mono, monospace',
      'font-size': 9,
      'font-weight': 700,
      color: 'data(color)',
    },
  },
  {
    selector: 'node.balance-node',
    style: { width: 200, height: 68, 'font-size': 12, 'font-weight': 700, 'border-width': 2 },
  },
  {
    selector: 'edge.balance-link',
    style: {
      'line-style': 'dashed',
      'line-dash-pattern': [5, 4],
      'line-opacity': 0.45,
      'arrow-scale': 0.75,
      label: '',
      events: 'no',
    },
  },
  { selector: 'edge.dashed', style: { 'line-style': 'dashed', 'line-dash-pattern': [7, 5], opacity: 0.4 } },
  { selector: 'edge.highlighted', style: { width: 2.5, opacity: 1, 'z-index': 20 } },
  { selector: 'edge.dimmed', style: { opacity: 0.1 } },
];
