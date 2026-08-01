import {
  Component, inject, signal, computed,
  OnInit, AfterViewInit, OnDestroy,
  ViewChild, ElementRef,
} from '@angular/core';
import cytoscape, { Core } from 'cytoscape';
// @ts-ignore
import dagre from 'cytoscape-dagre';

import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { FinanceApiService } from '../../core/services/finance-api.service';
import {
  AccountFlowGraph,
  AccountFlowGraphMode,
  MONTH_LABELS,
} from '../../core/models/api.models';
import { nodeDisplayName, nodeTypeLabel } from '../../core/utils/account-labels.util';

// Registra o layout dagre (hierárquico, como AWS)
cytoscape.use(dagre);

/** Modo estendido , 'current' é resolvido no frontend (confirmed + planned pendentes) */
type ExtendedMode = AccountFlowGraphMode;

// ── Paleta por tipo de nó ────────────────────────────────────────────────────
interface NodeStyle { border: string; bg: string; text: string; }

// Azul canônico de investimentos (= --accent-invest do design system)
const INV_L = '#2065D1';
const INV_D = '#76B0F1';

const LIGHT: Record<string, NodeStyle> = {
  bank:       { border: INV_L,     bg: 'rgba(32,101,209,0.08)',   text: '#103996' },
  credit:     { border: '#f59e0b', bg: 'rgba(245,158,11,0.10)',   text: '#b45309' },
  bill:       { border: '#f59e0b', bg: 'rgba(245,158,11,0.10)',   text: '#b45309' },
  investment: { border: INV_L,     bg: 'rgba(32,101,209,0.08)',   text: '#103996' },
  expense:    { border: '#FF5630', bg: 'rgba(255,86,48,0.08)',    text: '#B71D18' },
  income:     { border: '#22C55E', bg: 'rgba(34,197,94,0.08)',    text: '#16A34A' },
  goal:       { border: '#D97706', bg: 'rgba(217,119,6,0.08)',    text: '#92400E' },
  transfer:   { border: '#0ea5e9', bg: 'rgba(14,165,233,0.10)',   text: '#0369a1' },
  installment:{ border: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  text: '#b45309' },
  unassigned: { border: '#919EAB', bg: 'rgba(145,158,171,0.06)', text: '#637381' },
};

const DARK: Record<string, NodeStyle> = {
  bank:       { border: INV_D,     bg: 'rgba(118,176,241,0.14)',  text: '#B2D2F7' },
  credit:     { border: '#FBBF24', bg: 'rgba(251,191,36,0.14)',   text: '#FCD34D' },
  bill:       { border: '#FBBF24', bg: 'rgba(251,191,36,0.14)',   text: '#FCD34D' },
  investment: { border: INV_D,     bg: 'rgba(118,176,241,0.14)',  text: '#B2D2F7' },
  expense:    { border: '#FF5630', bg: 'rgba(255,86,48,0.14)',    text: '#FF8A6A' }, // vermelho mesmo no dark
  income:     { border: '#4ADE80', bg: 'rgba(74,222,128,0.14)',   text: '#86EFAC' },
  goal:       { border: '#FCD34D', bg: 'rgba(252,211,77,0.14)',   text: '#FDE68A' },
  transfer:   { border: '#38bdf8', bg: 'rgba(56,189,248,0.14)',   text: '#7dd3fc' },
  installment:{ border: '#FBBF24', bg: 'rgba(251,191,36,0.14)',   text: '#FCD34D' },
  unassigned: { border: '#637381', bg: 'rgba(99,115,129,0.10)',  text: '#919EAB' },
};

function isDark(): boolean {
  return (document.documentElement.getAttribute('data-theme') ??
          document.body.getAttribute('data-theme')) === 'dark';
}

function hexRgba(hex: string, a: number): string {
  if (!hex || hex.length < 7) return `rgba(145,158,171,${a})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return isNaN(r) ? `rgba(145,158,171,${a})` : `rgba(${r},${g},${b},${a})`;
}

@Component({
  selector: 'app-account-graph',
  standalone: true,
  imports: [CurrencyBrlPipe, MonthNavComponent],
  templateUrl: './account-graph.component.html',
  styleUrl: './account-graph.component.scss',
})
export class AccountGraphComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cyContainer', { static: false }) cyRef!: ElementRef<HTMLDivElement>;

  private api  = inject(FinanceApiService);
  private cy: Core | null = null;

  year     = signal(new Date().getFullYear());
  month    = signal(new Date().getMonth());
  mode     = signal<ExtendedMode>('confirmed');
  graph    = signal<AccountFlowGraph | null>(null);
  loading  = signal(true);
  isEmpty  = signal(false);
  zoomPct  = signal(100);

  // ── Tooltip ────────────────────────────────────────────────────────────────
  tooltip = signal<{
    visible: boolean;
    x: number; y: number;
    title: string;
    rows: { label: string; value: string; color?: string }[];
    color: string;
  }>({ visible: false, x: 0, y: 0, title: '', rows: [], color: '#637381' });

  monthLabel    = computed(() => MONTH_LABELS[this.month()] ?? '');
  totals        = computed(() => this.graph()?.totals ?? null);
  unassignedCnt = computed(() => this.graph()?.unassigned.length ?? 0);

  // ── Estado do painel de filtros ─────────────────────────────────────────
  showFilters   = signal(false);

  // Filtros activos (Set vazio = sem filtro = mostra tudo)
  filterTypes      = signal<Set<string>>(new Set());
  filterAccounts   = signal<Set<string>>(new Set());   // node IDs
  filterCategories = signal<Set<string>>(new Set());
  filterTabs       = signal<Set<string>>(new Set());

  // Opções de filtro vindas do cadastro (todas as contas, categorias e abas do planejamento)
  availableTypes = computed((): { key: string; label: string }[] => {
    const map: Record<string, string> = {
      expense: 'Gastos',
      installment: 'Gastos/Parcelas',
      income: 'Recebimentos',
      investment: 'Investimentos',
      goal: 'Metas',
      transfer: 'Transferências',
      bank: 'Bancos',
      credit: 'Cartões',
      bill: 'Faturas',
    };
    const types = new Set<string>();
    for (const n of this.graph()?.nodes ?? []) {
      types.add(n.type);
    }
    for (const e of this.graph()?.edges ?? []) {
      if (e.kind) types.add(e.kind);
      if (e.subKind) types.add(e.subKind);
    }
    return [...types].filter((t) => map[t]).map((t) => ({ key: t, label: map[t] }));
  });

  availableAccounts = computed((): { id: string; label: string; color: string }[] => {
    const opts = this.graph()?.filterOptions?.accounts ?? [];
    return opts.map(a => ({
      id: a.nodeId,
      label: a.name,
      color: a.color || '#637381',
    }));
  });

  availableCategories = computed((): { id: string; name: string; icon: string }[] => {
    const opts = this.graph()?.filterOptions?.categories ?? [];
    return opts.map(c => ({ id: String(c.id), name: c.name, icon: c.icon || '📌' }));
  });

  /** Abas personalizadas (ex. Brasil, Portugal) + Geral (sem aba). */
  availableTabs = computed((): { id: string; name: string }[] => {
    const tabs = (this.graph()?.filterOptions?.customTabs ?? []).map(t => ({
      id: String(t.id),
      name: t.name,
    }));
    return [...tabs, { id: 'geral', name: 'Geral' }];
  });

  activeFilterCount = computed(() =>
    this.filterTypes().size +
    this.filterAccounts().size +
    this.filterCategories().size +
    this.filterTabs().size
  );

  ngOnInit(): void { this.load(); }

  ngAfterViewInit(): void { this.initCy(); }

  ngOnDestroy(): void { this.cy?.destroy(); this.cy = null; }

  // ── Carregamento de dados ──────────────────────────────────────────────────

  load(): void {
    this.loading.set(true);
    this.isEmpty.set(false);

    const y = this.year();
    const m = this.month() + 1;
    const mode = this.mode();

    this.api.getAccountFlowGraph(y, m, mode).subscribe({
      next: (g) => {
        this.graph.set(g);
        this.loading.set(false);
        this.isEmpty.set(!g.nodes.length);
        if (this.cy) this.renderGraph(g);
      },
      error: () => {
        this.graph.set(null);
        this.loading.set(false);
        this.isEmpty.set(true);
        this.cy?.elements().remove();
      },
    });
  }

  setMode(m: ExtendedMode): void {
    if (this.mode() === m) return;
    this.mode.set(m);
    this.load();
  }

  onYearChange(y: number): void { this.year.set(y); this.load(); }
  onMonthChange(m: number): void { this.month.set(m); this.load(); }

  // ── Inicialização do Cytoscape ────────────────────────────────────────────

  private initCy(): void {
    if (!this.cyRef?.nativeElement) return;

    const dark = isDark();
    // Sem variável edgeLabelBg , fundo dos labels removido (veja stylesheet abaixo)

    this.cy = cytoscape({
      container: this.cyRef.nativeElement,

      style: [
        // Nós
        {
          selector: 'node',
          style: {
            'shape': 'round-rectangle' as any,
            'width': 156,
            'height': 60,
            'background-color': 'data(bgColor)',
            'background-opacity': 1,
            'border-color': 'data(borderColor)',
            'border-width': 1.5,
            'content': 'data(label)',
            'font-family': 'Public Sans, system-ui, sans-serif',
            'font-size': 11,
            'font-weight': '600',
            'color': 'data(textColor)',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '136px',
            'line-height': 1.3,
            'shadow-blur': 10,
            'shadow-color': dark ? 'rgba(0,0,0,0.45)' : 'rgba(145,158,171,0.22)',
            'shadow-offset-x': 0,
            'shadow-offset-y': 4,
            'shadow-opacity': 0.7,
            'z-index': 10,
          } as any,
        },
        // Nó selecionado / em destaque
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 2.5,
            'shadow-blur': 20,
            'shadow-opacity': 1,
          } as any,
        },
        // Nó a definir (border dashed)
        {
          selector: 'node[?unassigned]',
          style: {
            'border-style': 'dashed' as any,
            'opacity': 0.7,
          },
        },
        // Nó desfocado
        { selector: 'node.dimmed', style: { 'opacity': 0.18 } },

        // Edges
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': 'data(color)',
            'arrow-scale': 0.9,
            'line-color': 'data(color)',
            'line-opacity': 0.7,
            'width': 1.75,
            'content': 'data(amountLabel)',
            'font-family': '"JetBrains Mono", ui-monospace, monospace',
            'font-size': 9,
            'font-weight': '700',
            'color': 'data(color)',
            'text-background-opacity': 0,   /* sem fundo , funciona em light e dark */
            'text-border-opacity': 0,
            'text-outline-width': 0,
            'z-index': 5,
          } as any,
        },
        // Nó de saldo (nível 4 , sintético)
        {
          selector: 'node.balance-node',
          style: {
            'width': 200,
            'height': 68,
            'font-size': 12,
            'font-weight': '700',
            'border-width': 2,
            'text-max-width': '180px',
          } as any,
        },
        // Edge de ligação nível 3 → saldo nível 4 (visível, seta colorida)
        {
          selector: 'edge.balance-link',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': 'data(color)',
            'arrow-scale': 0.75,
            'line-color': 'data(color)',
            'line-opacity': 0.45,
            'line-style': 'dashed' as any,
            'line-dash-pattern': [5, 4],
            'width': 1.25,
            'content': '',         // sem label de valor
            'events': 'no',
          } as any,
        },
        // Edge tracejada (sem conta definida)
        {
          selector: 'edge.dashed',
          style: {
            'line-style': 'dashed' as any,
            'line-dash-pattern': [7, 5],
            'line-opacity': 0.4,
          },
        },
        { selector: 'edge.highlighted', style: { 'width': 2.5, 'line-opacity': 1, 'z-index': 20 } },
        { selector: 'edge.dimmed',      style: { 'opacity': 0.1 } },
      ],

      layout:              { name: 'preset' },
      zoomingEnabled:      true,
      userZoomingEnabled:  true,
      panningEnabled:      true,
      userPanningEnabled:  true,
      boxSelectionEnabled: false,
      selectionType:       'single',
      minZoom:             0.15,
      maxZoom:             4,
    });

    // Clique em nó → realça conexões
    this.cy.on('tap', 'node', (ev) => {
      const n = ev.target;
      const edges = n.connectedEdges();
      this.cy!.elements().addClass('dimmed').removeClass('highlighted');
      n.removeClass('dimmed').addClass('highlighted');
      edges.removeClass('dimmed').addClass('highlighted');
      edges.connectedNodes().removeClass('dimmed');
    });

    // Clique no fundo → reseta
    this.cy.on('tap', (ev) => {
      if (ev.target === this.cy) {
        this.cy!.elements().removeClass('dimmed highlighted');
      }
    });

    // Atualiza % de zoom
    this.cy.on('zoom', () => {
      this.zoomPct.set(Math.round((this.cy?.zoom() ?? 1) * 100));
    });

    // ── Tooltips de hover ─────────────────────────────────────────────────
    const container = this.cyRef.nativeElement;

    this.cy.on('mouseover', 'node', (ev) => {
      const n = ev.target;
      const d = n.data();
      if (d.isBalance) {
        // Nó de saldo , mostra título e valor
        this.tooltip.set({
          visible: true, ...this.cursorPos(ev, container),
          title: d.type === 'balance' ? 'Saldo' : 'Total',
          color: d.borderColor,
          rows: [{ label: d.label.replace(/\n/g, ' › '), value: '' }],
        });
      } else {
        const typeMap: Record<string, string> = {
          bank: 'Conta bancária',
          credit: 'Cartão de crédito',
          bill: 'Fatura',
          investment: 'Conta de investimento',
          expense: 'Gasto',
          income: 'Recebimento',
          goal: 'Meta',
          transfer: 'Transferência',
          installment: 'Parcela',
          balance: 'Saldo',
        };
        const labelLines = ((n.data('label') as string) ?? '').split('\n');
        const titleName = labelLines.length > 1 ? labelLines[1] : (labelLines[0] ?? n.id());
        this.tooltip.set({
          visible: true, ...this.cursorPos(ev, container),
          title: typeMap[d.type] ?? d.type,
          color: d.borderColor,
          rows: [{ label: titleName, value: '' }],
        });
      }
    });

    this.cy.on('mouseover', 'edge', (ev) => {
      const e = ev.target;
      const d = e.data();
      if (e.hasClass('balance-link') || e.hasClass('balance-edge')) return;

      const kindMap: Record<string, string> = {
        expense: 'Gasto',
        income: 'Recebimento',
        investment: 'Investimento',
        goal: 'Meta',
        leisure: 'Lazer',
        transfer: 'Transferência',
        installment: 'Parcela',
        bill: 'Fatura',
      };
      const rows: { label: string; value: string; color?: string }[] = [
        { label: 'Valor', value: d.amountLabel, color: d.color },
      ];

      const srcLabel = nodeDisplayName(e.source().data('label') as string, e.source().id());
      const tgtLabel = nodeDisplayName(e.target().data('label') as string, e.target().id());
      rows.push({ label: 'De', value: srcLabel });
      rows.push({ label: 'Para', value: tgtLabel });

      const g = this.graph();
      const edge = g?.edges.find(ge => ge.refId === d.refId);
      if (edge?.itemCategoryName) rows.push({ label: 'Categoria', value: edge.itemCategoryName });
      if (edge?.customTabName)    rows.push({ label: 'Aba', value: edge.customTabName });

      this.tooltip.set({
        visible: true, ...this.cursorPos(ev, container),
        title: kindMap[d.subKind] ?? kindMap[d.kind] ?? d.kind,
        color: d.color,
        rows,
      });
    });

    this.cy.on('mouseout', 'node, edge', () => {
      this.tooltip.update(t => ({ ...t, visible: false }));
    });

    // Esconde tooltip ao arrastar
    this.cy.on('pan zoom grab', () => {
      this.tooltip.update(t => ({ ...t, visible: false }));
    });

    const g = this.graph();
    if (g?.nodes.length) this.renderGraph(g);
  }

  private cursorPos(ev: any, container: HTMLElement): { x: number; y: number } {
    const rect = container.getBoundingClientRect();
    const orig = ev.originalEvent as MouseEvent;
    return {
      x: orig.clientX - rect.left + 14,
      y: orig.clientY - rect.top  - 8,
    };
  }

  // ── Renderiza o grafo no Cytoscape ────────────────────────────────────────

  private renderGraph(g: AccountFlowGraph): void {
    if (!this.cy) return;

    const dark   = isDark();
    const palette = dark ? DARK : LIGHT;
    const alpha   = dark ? 0.14 : 0.08;
    const textClr = dark ? '#E8ECEF' : '#1C252E';

    const elements: cytoscape.ElementDefinition[] = [];

    // Nós
    for (const n of g.nodes) {
      const key  = (n.unassigned ? 'unassigned' : n.type) as keyof typeof LIGHT;
      const c    = palette[key] ?? palette['bank'];
      const nameTrunc = this.trunc(n.label, 22);
      const typeLbl = nodeTypeLabel(n.type, !!n.unassigned);
      // Regras de cor:
      // • investment → sempre azul canônico
      // • bank/credit → cor individual da conta (definida em Contas)
      // • goal       → cor individual da meta (definida em Metas)
      // • demais     → paleta por tipo
      let bgColor: string;
      let bdColor: string;
      if (n.type === 'investment') {
        const invClr = dark ? INV_D : INV_L;
        bdColor = invClr;
        bgColor = hexRgba(invClr, alpha);
      } else if ((n.type === 'bank' || n.type === 'credit') && n.color) {
        bdColor = n.color;
        bgColor = hexRgba(n.color, alpha);
      } else if (n.type === 'goal' && n.color) {
        bdColor = n.color;
        bgColor = hexRgba(n.color, alpha);
      } else {
        bdColor = c.border;
        bgColor = c.bg;
      }

      elements.push({
        data: {
          id: n.id,
          label: `${typeLbl}\n${nameTrunc}`,
          bgColor,
          borderColor: bdColor,
          textColor: textClr,
          type: n.type,
          unassigned: n.unassigned ?? false,
        },
        classes: n.unassigned ? 'unassigned' : '',
      });
    }

    // Arestas , metadados para filtragem
    // Modo 'planned': itens variáveis já foram excluídos pelo backend
    // (WHERE recurring_item_id IS NOT NULL OR financial_goal_id IS NOT NULL)
    // Nenhum filtro adicional necessário no frontend.

    for (const e of g.edges) {

      elements.push({
        data: {
          id: `e_${e.refId}_${e.from}_${e.to}`,
          source: e.from,
          target: e.to,
          color: e.color || '#637381',
          amountLabel: this.fmtAmt(e.amountBrl),
          kind: e.kind || '',
          subKind: e.subKind || '',
          itemCategoryId: e.itemCategoryId != null ? String(e.itemCategoryId) : 'geral',
          customTabId: e.customTabId != null ? String(e.customTabId) : 'geral',
        },
        classes: e.dashed ? 'dashed' : '',
      });
    }

    // ── Níveis 4 e 5: saldo por conta + saldo total ───────────────────────

    // Indexar nós por id para lookup rápido
    const nodeById = new Map(g.nodes.map(n => [n.id, n]));

    // Acumular inflow/outflow e ids dos nós destino por banco
    interface BankBal {
      label: string; color: string;
      inflow: number; outflow: number;
      destIds: Set<string>;   // expense/invest/goal conectados a este banco
    }
    const bankBal = new Map<string, BankBal>();
    for (const n of g.nodes.filter(n => n.type === 'bank')) {
      bankBal.set(n.id, { label: n.label, color: n.color || INV_L,
        inflow: 0, outflow: 0, destIds: new Set() });
    }

    for (const e of g.edges) {
      const srcType = nodeById.get(e.from)?.type;
      const tgtType = nodeById.get(e.to)?.type;
      // receita → banco
      if (srcType === 'income' && tgtType === 'bank') {
        bankBal.get(e.to)!.inflow  += e.amountBrl;
      }
      // banco → destino
      if (srcType === 'bank' && bankBal.has(e.from)) {
        const b = bankBal.get(e.from)!;
        b.outflow += e.amountBrl;
        if (tgtType && ['expense','investment','goal','installment'].includes(tgtType)) {
          b.destIds.add(e.to);
        }
      }
    }

    // Nível 4 , um nó de saldo por banco
    let totalBalance = 0;
    const balSaldoClr = (v: number) => v >= 0 ? '#22C55E' : '#FF5630';
    const balTextClr  = (v: number, d: boolean) =>
      v >= 0 ? (d ? '#86EFAC' : '#16A34A') : (d ? '#FFAC82' : '#B71D18');

    for (const [bankId, b] of bankBal.entries()) {
      const bal = b.inflow - b.outflow;
      totalBalance += bal;
      const clr = balSaldoClr(bal);

      elements.push({
        data: {
          id: `__saldo_${bankId}`,
          label: `${this.trunc(b.label, 16)}\n${bal >= 0 ? '+' : ''}${this.fmtAmt(bal)}`,
          bgColor:     hexRgba(clr, alpha),
          borderColor: clr,
          textColor:   balTextClr(bal, dark),
          type: 'balance', unassigned: false, isBalance: true,
        },
        classes: 'balance-node',
      });

      // Edges visíveis (tracejadas): destinos deste banco → saldo deste banco
      if (b.destIds.size > 0) {
        for (const destId of b.destIds) {
          // Usa a cor do nó de destino (expense=vermelho, invest=azul, goal=cor da meta)
          const destNode = nodeById.get(destId);
          const destType = destNode?.type ?? 'expense';
          const edgeClr = destType === 'investment' ? (dark ? INV_D : INV_L)
                        : destType === 'goal'       ? (destNode?.color || '#D97706')
                        : destType === 'installment'? '#f59e0b'
                        : '#FF5630'; // expense default

          elements.push({
            data: { id: `__bl_${bankId}_${destId}`, source: destId,
              target: `__saldo_${bankId}`, color: edgeClr,
              amountLabel: '', kind: '', category: '', tab: '' },
            classes: 'balance-link',
          });
        }
      } else {
        // Banco sem saídas → conecta do banco direto (nível 3 vazio)
        elements.push({
          data: { id: `__bl_${bankId}`, source: bankId,
            target: `__saldo_${bankId}`, color: dark ? INV_D : INV_L,
            amountLabel: '', kind: '', category: '', tab: '' },
          classes: 'balance-link',
        });
      }
    }

    // ── Nós órfãos (sem ligação a banco) → ligam directamente ao SALDO TOTAL ─
    // Garante que variáveis confirmadas sem banco definido chegam ao funil
    const coveredByBank = new Set<string>();
    for (const b of bankBal.values()) {
      b.destIds.forEach(id => coveredByBank.add(id));
    }

    const destTypes = new Set(['expense', 'investment', 'goal', 'installment']);
    const orphanNodes = g.nodes.filter(n =>
      destTypes.has(n.type) && !coveredByBank.has(n.id)
    );

    // Calcular saldo dos órfãos usando os totais da API (mais preciso)
    // O SALDO TOTAL usa os totais globais da API para garantir accuracy
    const apiInflow  = g.totals?.inflowBrl  ?? 0;
    const apiOutflow = g.totals?.outflowBrl ?? 0;
    const apiTotal   = apiInflow - apiOutflow;

    // Nível 5 , saldo total (usa valor API, inclui órfãos)
    const totalClr = balSaldoClr(apiTotal);
    elements.push({
      data: {
        id: '__saldo_total__',
        label: `Total\n${apiTotal >= 0 ? '+' : ''}${this.fmtAmt(apiTotal)}`,
        bgColor:     hexRgba(totalClr, Math.min(alpha * 1.6, 0.22)),
        borderColor: totalClr,
        textColor:   balTextClr(apiTotal, dark),
        type: 'balance', unassigned: false, isBalance: true,
      },
      classes: 'balance-node',
    });

    // Edges visíveis: cada saldo por conta → saldo total
    for (const [bankId, b] of bankBal.entries()) {
      const bal = b.inflow - b.outflow;
      const clr = balSaldoClr(bal);
      elements.push({
        data: {
          id: `__totbl_${bankId}`,
          source: `__saldo_${bankId}`,
          target: '__saldo_total__',
          color: clr,
          amountLabel: `${bal >= 0 ? '+' : ''}${this.fmtAmt(bal)}`,
          kind: '', category: '', tab: '',
        },
        classes: '',
      });
    }

    // Edges balance-link: nós órfãos → saldo total (tracejadas, sem bank intermediário)
    for (const orphan of orphanNodes) {
      const oType = orphan.type;
      const oClr  = oType === 'investment' ? (dark ? INV_D : INV_L)
                  : oType === 'goal'       ? (orphan.color || '#D97706')
                  : '#FF5630';
      elements.push({
        data: {
          id: `__orph_${orphan.id}`,
          source: orphan.id,
          target: '__saldo_total__',
          color: oClr,
          amountLabel: '', kind: '', category: '', tab: '',
        },
        classes: 'balance-link',
      });
    }

    this.cy.elements().remove();
    this.cy.add(elements);

    // Layout dagre , TB: receitas (topo) → bancos (meio) → gastos/invest/metas (baixo)
    const layout = this.cy.layout({
      name:              'dagre',
      rankDir:           'TB',   // Top → Bottom
      rankSep:           100,    // separação vertical entre camadas
      nodeSep:           36,     // separação horizontal entre nós da mesma camada
      edgeSep:           20,
      padding:           36,
      animate:           true,
      animationDuration: 500,
      animationEasing:   'ease-in-out-cubic',
      fit:               true,
    } as any);

    layout.run();

    // Aguarda animação, faz fit e re-aplica filtros activos
    setTimeout(() => { this.cy?.fit(undefined, 36); this.applyFilters(); }, 560);
  }

  // ── Controles da toolbar ──────────────────────────────────────────────────

  fitView(): void   { this.cy?.fit(undefined, 36); }
  zoomIn(): void    { this.zoom(1.3); }
  zoomOut(): void   { this.zoom(1 / 1.3); }
  resetZoom(): void { this.cy?.zoom(1); this.cy?.center(); }

  // ── Métodos de filtro ─────────────────────────────────────────────────────

  toggleFilters(): void { this.showFilters.update(v => !v); }

  toggleType(key: string): void {
    this.filterTypes.update(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
    this.applyFilters();
  }

  toggleAccount(id: string): void {
    this.filterAccounts.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    this.applyFilters();
  }

  toggleCategory(catId: string): void {
    this.filterCategories.update(s => {
      const n = new Set(s);
      n.has(catId) ? n.delete(catId) : n.add(catId);
      return n;
    });
    this.applyFilters();
  }

  toggleTab(tabId: string): void {
    this.filterTabs.update(s => {
      const n = new Set(s);
      n.has(tabId) ? n.delete(tabId) : n.add(tabId);
      return n;
    });
    this.applyFilters();
  }

  clearFilters(): void {
    this.filterTypes.set(new Set());
    this.filterAccounts.set(new Set());
    this.filterCategories.set(new Set());
    this.filterTabs.set(new Set());
    this.applyFilters();
  }

  isTypeActive(k: string)    { return this.filterTypes().has(k); }
  isAccountActive(id: string){ return this.filterAccounts().has(id); }
  isCategoryActive(c: string){ return this.filterCategories().has(c); }
  isTabActive(t: string)     { return this.filterTabs().has(t); }

  applyFilters(): void {
    if (!this.cy) return;
    const types   = this.filterTypes();
    const accs    = this.filterAccounts();
    const cats    = this.filterCategories();
    const tabs    = this.filterTabs();
    const noFilter = !types.size && !accs.size && !cats.size && !tabs.size;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cy = this.cy as any;

    if (noFilter) {
      cy.elements().show();
      return;
    }

    // Filtra edges (ignora balance-links , sempre invisíveis)
    cy.edges().forEach((e: any) => {
      if (e.hasClass('balance-link')) return;
      const d = e.data();
      const typeOk = !types.size || types.has(d.kind) || types.has(d.subKind);
      const catOk  = !cats.size  || cats.has(d.itemCategoryId);
      const tabOk  = !tabs.size  || tabs.has(d.customTabId);
      const accOk  = !accs.size  || accs.has(e.source().id()) || accs.has(e.target().id());
      typeOk && catOk && tabOk && accOk ? e.show() : e.hide();
    });

    // Mostra nós com edge visível; saldo sempre presente
    cy.nodes().forEach((n: any) => {
      if (n.hasClass('balance-node')) return;
      const visibleEdges = n.connectedEdges()
        .filter((e: any) => !e.hasClass('balance-link'));
      visibleEdges.some((e: any) => !e.hidden()) ? n.show() : n.hide();
    });
  }

  private zoom(factor: number): void {
    if (!this.cy) return;
    const center = { x: this.cy.width() / 2, y: this.cy.height() / 2 };
    this.cy.zoom({ level: this.cy.zoom() * factor, renderedPosition: center });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private trunc(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  private fmtAmt(v: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  }
}
