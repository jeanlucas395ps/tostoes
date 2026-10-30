import {
  Component, inject, signal, computed, effect,
  OnInit, AfterViewInit, OnDestroy,
  ViewChild, ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import cytoscape, { Core, EventObject } from 'cytoscape';
// @ts-ignore
import dagre from 'cytoscape-dagre';

import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { SafeHtmlPipe } from '../../core/pipes/safe-html.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { FinanceApiService } from '../../core/services/finance-api.service';
import {
  AccountFlowGraph,
  AccountFlowGraphMode,
  AccountFlowGraphNode,
  FinancialAccount,
} from '../../core/models/api.models';
import {
  amountPlacement,
  canLinkGraphNodes,
  HUB_SPAWN_KIND_LEISURE,
  HUB_SPAWN_KINDS,
  isFlowNodeId as isFlowGraphId,
  isHubNodeId,
} from '../../core/utils/account-graph-mapping.util';

cytoscape.use(dagre);

function blockIcon(paths: string): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const ICON_INCOME = blockIcon('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>');
const ICON_EXPENSE = blockIcon('<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2z"/><path d="M8 7h8"/><path d="M8 11h8"/>');
const ICON_TREND = blockIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>');
const ICON_BANK = blockIcon('<polygon points="12 2 20 7 4 7"/><line x1="6" x2="6" y1="11" y2="18"/><line x1="10" x2="10" y1="11" y2="18"/><line x1="14" x2="14" y1="11" y2="18"/><line x1="18" x2="18" y1="11" y2="18"/><line x1="3" x2="21" y1="22" y2="22"/>');
const ICON_CARD = blockIcon('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>');
const ICON_INV = blockIcon('<path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/>');
const ICON_TOTAL = blockIcon('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>');
const ICON_GOAL = blockIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>');
const ICON_TRANSFER = blockIcon('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>');
const ICON_BALANCE = blockIcon('<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>');

const CARD_W = 228;
const CARD_H = 76;

/** Ícone do tipo, desenhado dentro do quadrado colorido do cartão. */
function nodeCardIcon(id: string, type: string): string {
  if (id.startsWith('__saldo')) return ICON_BALANCE;
  if (id.startsWith('bank:') || type === 'bank') return ICON_BANK;
  if (id.startsWith('credit:') || type === 'credit') return ICON_CARD;
  if (id.startsWith('inv:')) return ICON_INV;
  if (id.startsWith('tot:') || type === 'totalizer') return ICON_TOTAL;
  switch (type) {
    case 'income':
      return ICON_INCOME;
    case 'expense':
    case 'leisure':
    case 'installment':
      return ICON_EXPENSE;
    case 'investment':
      return ICON_TREND;
    case 'goal':
      return ICON_GOAL;
    case 'transfer':
      return ICON_TRANSFER;
    default:
      return ICON_EXPENSE;
  }
}

type ExtendedMode = AccountFlowGraphMode;
type FormKind = 'income' | 'expense' | 'investment' | 'leisure';
type GraphBlockKind = FormKind | 'bank' | 'credit' | 'investment-account' | 'totalizer';

const DRAFT_ITEM_ID = '__draft_item';
const DRAFT_AMT_ID = '__draft_amt';
const DRAFT_E0 = '__draft_e0';
const DRAFT_E1 = '__draft_e1';

interface NodeOverlay {
  id: string;
  x: number;
  y: number;
  /** Tamanho em px já proporcional ao zoom do bloco. */
  size: number;
  happened: boolean;
  busy: boolean;
}

interface NodeActionsUi {
  nodeId: string;
  x: number;
  y: number;
}

/** Mini preview Excalidraw ao lado de um hub (banco/cartão). */
interface HubSpawnPreview {
  hubNodeId: string;
  accountId: number;
  hubType: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FlowCard {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Escala o miolo fixo (228×76) até o tamanho renderizado do bloco. */
  scale: number;
  title: string;
  value: string;
  /** Segunda linha é o tipo da conta, não um valor em dinheiro. */
  meta: boolean;
  accent: string;
  icon: string;
  draft: boolean;
  dimmed: boolean;
  /** Checkbox “feito”, só em itens que podem ser marcados. */
  check: { happened: boolean; busy: boolean } | null;
}

interface LinkPortOverlay {
  nodeId: string;
  x: number;
  y: number;
  size: number;
}

interface DeletePrompt {
  nodeId: string;
  entryId: number;
  recurringItemId: number | null;
  name: string;
  kind: string;
  kindLabel: string;
  isFixed: boolean;
}

interface EdgeRewireState {
  flowNodeId: string;
  oldHubId: string;
}

interface LinkArrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  valid: boolean;
  head: string;
}

function isDark(): boolean {
  return (document.documentElement.getAttribute('data-theme') ??
    document.body.getAttribute('data-theme')) === 'dark';
}

@Component({
  selector: 'app-account-graph',
  standalone: true,
  imports: [FormsModule, SafeHtmlPipe, CurrencyBrlPipe, MonthNavComponent, SkeletonComponent],
  templateUrl: './account-graph.component.html',
  styleUrl: './account-graph.component.scss',
})
export class AccountGraphComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cyContainer', { static: false }) cyRef!: ElementRef<HTMLDivElement>;

  private api = inject(FinanceApiService);
  readonly bankMenuIcon = ICON_BANK;
  private cy: Core | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayRaf = 0;
  private hubHoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hubPreviewPinned = false;
  private draftAnchorKey = '';

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  mode = signal<ExtendedMode>('current');
  graph = signal<AccountFlowGraph | null>(null);
  loading = signal(true);
  isEmpty = signal(false);
  zoomPct = signal(100);

  accounts = signal<FinancialAccount[]>([]);
  busyConfirm = signal<Set<string>>(new Set());
  /** Checkbox “aconteceu” sem recarregar o grafo. */
  happenedIds = signal<Set<string>>(new Set());

  showFilters = signal(false);
  filterTypes = signal<Set<string>>(new Set());
  filterAccounts = signal<Set<string>>(new Set());
  filterCategories = signal<Set<string>>(new Set());
  filterTabs = signal<Set<string>>(new Set());

  sidePanelOpen = signal(true);
  panelMode = signal<'create' | 'edit'>('create');
  createStep = signal<'pick' | 'form'>('pick');
  formBlock = signal<GraphBlockKind | null>(null);
  /** Banco: escolher um que já existe ou cadastrar outro. */
  accountMode = signal<'pick' | 'new'>('new');
  formKind = signal<FormKind>('expense');
  formRecurrence = signal<'fixed' | 'variable'>('variable');
  formName = signal('');
  formAmount = signal(0);
  formColor = signal('#3b82f6');
  formInitialBalance = signal(0);
  formCreditLimit = signal<number | null>(null);
  formClosingDay = signal<number | null>(1);
  formDueDay = signal<number | null>(10);
  formAccountId = signal<number | null>(null);
  formTargetAccountId = signal<number | null>(null);
  formError = signal('');
  formSaving = signal(false);
  formSpawnX = signal<number | null>(null);
  formSpawnY = signal<number | null>(null);
  formLinkAccountNodeId = signal<string | null>(null);
  editingEntryId = signal<number | null>(null);

  linkMode = signal(false);
  linkFromId = signal<string | null>(null);
  linkHint = signal('');
  /** Seta elástica do ponto de ligação até o mouse. */
  linkArrow = signal<LinkArrow | null>(null);
  private linkPointer: { moved: boolean; x: number; y: number } | null = null;
  private rewire: { from: string; to: string; moving: 'from' | 'to' } | null = null;
  private swallowNextTap = false;
  nodeOverlays = signal<NodeOverlay[]>([]);
  flowCards = signal<FlowCard[]>([]);
  nodeActions = signal<NodeActionsUi | null>(null);
  hubSpawnPreview = signal<HubSpawnPreview | null>(null);
  linkPorts = signal<LinkPortOverlay[]>([]);
  deletePrompt = signal<DeletePrompt | null>(null);
  deleteBusy = signal(false);
  edgeRewire = signal<EdgeRewireState | null>(null);
  selectedNodeId = signal<string | null>(null);
  readonly spawnKinds = HUB_SPAWN_KINDS;

  /** Lazer só no select se já existir no grafo / item em edição (dado legado/teste). */
  formKindOptions = computed(() => {
    const opts: Array<{ value: FormKind; label: string }> = [
      { value: 'income', label: 'Recebimento' },
      { value: 'expense', label: 'Gasto' },
      { value: 'investment', label: 'Investimento / aporte' },
    ];
    if (this.shouldShowLeisureOption()) {
      opts.push({ value: 'leisure', label: 'Lazer' });
    }
    return opts;
  });

  totals = computed(() => this.graph()?.totals ?? null);
  unassignedCnt = computed(() => this.graph()?.unassigned.length ?? 0);

  panelTitle = computed(() => {
    if (this.panelMode() === 'edit') return 'Editar item';
    if (this.createStep() === 'pick') return 'O que adicionar?';
    return this.blockTitle(this.formBlock());
  });
  panelKicker = computed(() => {
    if (this.panelMode() === 'edit') {
      return this.formRecurrence() === 'fixed' ? 'Atalho · item fixo' : 'Atalho · movimento do mês';
    }
    if (this.createStep() === 'pick') return 'Escolha o tipo do bloco';
    return 'Configuração';
  });
  linkFromLabel = computed(() => {
    const id = this.linkFromId();
    if (!id) return '';
    return this.graph()?.nodes.find((n) => n.id === id)?.label ?? id;
  });

  bankAndCreditAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'bank' || a.type === 'credit')
  );
  bankAccounts = computed(() => this.accounts().filter((a) => a.type === 'bank'));
  investmentAccounts = computed(() => this.accounts().filter((a) => a.type === 'investment'));

  availableTypes = computed((): { key: string; label: string }[] => {
    const map: Record<string, string> = {
      expense: 'Gastos',
      installment: 'Parcelas',
      income: 'Recebimentos',
      investment: 'Investimentos',
      goal: 'Metas',
      transfer: 'Transferências',
      bank: 'Bancos',
      credit: 'Cartões',
    };
    const types = new Set<string>();
    for (const n of this.graph()?.nodes ?? []) types.add(n.type);
    for (const e of this.graph()?.edges ?? []) {
      if (e.kind) types.add(e.kind);
      if (e.subKind) types.add(e.subKind);
    }
    return [...types].filter((t) => map[t]).map((t) => ({ key: t, label: map[t] }));
  });

  availableAccounts = computed((): { id: string; label: string; color: string }[] => {
    const opts = this.graph()?.filterOptions?.accounts ?? [];
    return opts.map((a) => ({ id: a.nodeId, label: a.name, color: a.color || '#6B6E7A' }));
  });

  activeFilterCount = computed(
    () =>
      this.filterTypes().size +
      this.filterAccounts().size +
      this.filterCategories().size +
      this.filterTabs().size
  );

  /** Preview ao vivo do bloco sendo criado no painel (movimento, conta ou totalizador). */
  private readonly draftPreviewEffect = effect(() => {
    const block = this.formBlock();
    const open =
      this.sidePanelOpen() &&
      this.panelMode() === 'create' &&
      this.createStep() === 'form' &&
      !!block;
    this.formKind();
    this.formName();
    this.formAmount();
    this.formColor();
    this.formInitialBalance();
    this.accountMode();
    this.formAccountId();
    this.formTargetAccountId();
    this.formLinkAccountNodeId();
    this.formSpawnX();
    this.formSpawnY();
    if (!open) {
      queueMicrotask(() => this.removeDraftPreview());
      return;
    }
    queueMicrotask(() => this.syncDraftPreview());
  });

  ngOnInit(): void {
    this.loadAccounts();
    this.load();
    window.addEventListener('keydown', this.onKeyDown);
  }

  ngAfterViewInit(): void {
    this.initCy();
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.untrackLinkPointer();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.hubHoverTimer) clearTimeout(this.hubHoverTimer);
    cancelAnimationFrame(this.overlayRaf);
    this.cy?.destroy();
    this.cy = null;
  }

  private shouldShowLeisureOption(): boolean {
    if (this.formKind() === 'leisure') return true;
    const g = this.graph();
    if (!g) return false;
    return (
      g.nodes.some((n) => n.type === 'leisure') ||
      g.edges.some((e) => e.kind === 'leisure' || e.subKind === 'leisure')
    );
  }

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (this.deletePrompt()) return;
    const id = this.selectedNodeId() ?? this.nodeActions()?.nodeId ?? null;
    if (!id) return;
    ev.preventDefault();
    this.requestDeleteNode(id);
  };

  loadAccounts(): void {
    this.api.getAccounts().subscribe({
      next: (r) => this.accounts.set(r.items ?? []),
      error: () => this.accounts.set([]),
    });
  }

  load(): void {
    this.loading.set(true);
    this.isEmpty.set(false);
    this.nodeActions.set(null);
    this.happenedIds.set(new Set());
    this.removeDraftPreview();
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
        this.nodeOverlays.set([]);
        this.flowCards.set([]);
      },
    });
  }

  setMode(m: ExtendedMode): void {
    if (this.mode() === m) return;
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

  // ── Painel lateral ──────────────────────────────────────────────────────

  openCreatePanel(opts?: {
    kind?: FormKind;
    accountId?: number | null;
    linkAccountNodeId?: string | null;
    spawnX?: number | null;
    spawnY?: number | null;
  }): void {
    this.panelMode.set('create');
    this.editingEntryId.set(null);
    const preset = opts?.kind ?? null;
    this.createStep.set(preset ? 'form' : 'pick');
    this.formBlock.set(preset);
    this.formKind.set(preset ?? 'expense');
    this.formRecurrence.set('variable');
    this.formName.set('');
    this.formAmount.set(0);
    this.formAccountId.set(opts?.accountId ?? null);
    this.formTargetAccountId.set(null);
    this.formError.set('');
    this.formSpawnX.set(opts?.spawnX ?? null);
    this.formSpawnY.set(opts?.spawnY ?? null);
    this.formLinkAccountNodeId.set(opts?.linkAccountNodeId ?? null);
    this.clearHubSpawnPreview();
    this.sidePanelOpen.set(true);
  }

  /** Bloco avulso no ponto do canvas (sem conta). */
  openCreateAtCanvas(modelX: number, modelY: number): void {
    this.cancelLinkMode();
    this.openCreatePanel({ spawnX: modelX, spawnY: modelY });
  }

  openCreateFrom(nodeId: string): void {
    const hub = this.parseHubAccountId(nodeId);
    const n = this.graph()?.nodes.find((x) => x.id === nodeId);
    if (hub) {
      const isInv = n?.type === 'investment' || nodeId.startsWith('inv:');
      this.openCreatePanel({
        kind: isInv ? 'investment' : 'expense',
        accountId: isInv ? null : hub,
        linkAccountNodeId: nodeId,
      });
      if (isInv) this.formTargetAccountId.set(hub);
      return;
    }
    let kind: FormKind = 'expense';
    if (n?.type === 'income') kind = 'income';
    else if (n?.type === 'investment') kind = 'investment';
    else if (n?.type === 'leisure') kind = 'leisure';
    this.openCreatePanel({ kind });
  }

  /** Clique numa categoria do mini-preview ao lado do banco. */
  spawnFromHubPreview(kind: FormKind): void {
    const prev = this.hubSpawnPreview();
    if (!prev) return;
    const isInvHub = prev.hubNodeId.startsWith('inv:');
    const spawnKind = isInvHub ? 'investment' : kind;
    this.openCreatePanel({
      kind: spawnKind,
      accountId: isInvHub ? null : prev.accountId,
      linkAccountNodeId: prev.hubNodeId,
      spawnX: null,
      spawnY: null,
    });
    if (isInvHub || spawnKind === 'investment') {
      this.formTargetAccountId.set(
        isInvHub ? prev.accountId : this.formTargetAccountId()
      );
      if (!isInvHub) this.formAccountId.set(prev.accountId);
    }
  }

  chooseBlock(block: GraphBlockKind): void {
    this.formBlock.set(block);
    this.createStep.set('form');
    this.formError.set('');
    if (this.isFlowBlock(block)) this.formKind.set(block);
    if (block === 'bank') {
      this.formColor.set('#3b82f6');
      this.accountMode.set(this.bankAccounts().length ? 'pick' : 'new');
    } else {
      this.accountMode.set('new');
    }
    if (block === 'credit') this.formColor.set('#f59e0b');
    if (block === 'investment-account') this.formColor.set('#a371f7');
  }

  backToTypePick(): void {
    this.createStep.set('pick');
    this.formBlock.set(null);
    this.accountMode.set('new');
    this.formError.set('');
    this.removeDraftPreview();
  }

  /** Coloca no grafo um banco que já existe, na posição do arraste. */
  placeExistingBank(account: FinancialAccount): void {
    const x = this.formSpawnX() ?? 160;
    const y = this.formSpawnY() ?? 120;
    this.formSaving.set(true);
    this.formError.set('');
    this.api
      .saveAccountFlowGraphLayout({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode(),
        positions: [{ nodeKey: `bank:${account.id}`, x, y }],
      })
      .subscribe({
        next: () => {
          this.formSaving.set(false);
          this.closeSidePanel();
          this.load();
        },
        error: () => {
          this.formSaving.set(false);
          this.formError.set('Não foi possível colocar o banco no grafo.');
        },
      });
  }

  private isFlowBlock(block: GraphBlockKind | null): block is FormKind {
    return block === 'income' || block === 'expense' || block === 'investment' || block === 'leisure';
  }

  private blockTitle(block: GraphBlockKind | null): string {
    const map: Record<string, string> = {
      income: 'Novo recebimento',
      expense: 'Novo gasto',
      investment: 'Novo aporte',
      leisure: 'Novo lazer',
      bank: 'Novo banco',
      credit: 'Novo cartão',
      'investment-account': 'Nova conta de investimento',
      totalizer: 'Novo totalizador',
    };
    return block ? map[block] ?? 'Novo bloco' : 'Novo bloco';
  }

  createTypeGroups(): Array<{
    title: string;
    items: Array<{ id: GraphBlockKind; label: string; hint: string; icon: string }>;
  }> {
    const moves: Array<{ id: GraphBlockKind; label: string; hint: string; icon: string }> = [
      {
        id: 'income',
        label: 'Recebimento',
        hint: 'Entra numa conta',
        icon: blockIcon('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'),
      },
      {
        id: 'expense',
        label: 'Gasto',
        hint: 'Sai de uma conta ou cartão',
        icon: blockIcon('<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2z"/><path d="M8 7h8"/><path d="M8 11h8"/>'),
      },
      {
        id: 'investment',
        label: 'Aporte',
        hint: 'Da conta para um investimento',
        icon: blockIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
      },
    ];
    if (this.shouldShowLeisureOption()) {
      moves.push({
        id: 'leisure',
        label: 'Lazer',
        hint: 'Gasto de lazer já usado neste planejamento',
        icon: blockIcon('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/>'),
      });
    }
    return [
      { title: 'Movimentos', items: moves },
      {
        title: 'Contas',
        items: [
          {
            id: 'bank',
            label: 'Banco',
            hint: 'Conta bancária',
            icon: blockIcon('<polygon points="12 2 20 7 4 7"/><line x1="6" x2="6" y1="11" y2="18"/><line x1="10" x2="10" y1="11" y2="18"/><line x1="14" x2="14" y1="11" y2="18"/><line x1="18" x2="18" y1="11" y2="18"/><line x1="3" x2="21" y1="22" y2="22"/>'),
          },
          {
            id: 'credit',
            label: 'Cartão de crédito',
            hint: 'Limite, fecha e vence',
            icon: blockIcon('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>'),
          },
          {
            id: 'investment-account',
            label: 'Conta de investimento',
            hint: 'Destino dos aportes',
            icon: blockIcon('<path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/>'),
          },
        ],
      },
      {
        title: 'Agrupar',
        items: [
          {
            id: 'totalizer',
            label: 'Totalizador',
            hint: 'Soma vários itens e sai do banco como um gasto',
            icon: blockIcon('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
          },
        ],
      },
    ];
  }

  onBlockDragStart(block: GraphBlockKind, ev: DragEvent): void {
    ev.dataTransfer?.setData('application/x-graph-block', block);
    ev.dataTransfer?.setData('text/plain', block);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  }

  onCanvasDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  }

  onCanvasDrop(ev: DragEvent): void {
    ev.preventDefault();
    const raw =
      ev.dataTransfer?.getData('application/x-graph-block') ||
      ev.dataTransfer?.getData('text/plain');
    if (!raw || !this.cy || !this.cyRef) return;
    const rect = this.cyRef.nativeElement.getBoundingClientRect();
    const pan = this.cy.pan();
    const zoom = this.cy.zoom() || 1;
    this.panelMode.set('create');
    this.editingEntryId.set(null);
    this.formSpawnX.set((ev.clientX - rect.left - pan.x) / zoom);
    this.formSpawnY.set((ev.clientY - rect.top - pan.y) / zoom);
    this.chooseBlock(raw as GraphBlockKind);
  }

  pinHubSpawnPreview(): void {
    this.hubPreviewPinned = true;
    if (this.hubHoverTimer) {
      clearTimeout(this.hubHoverTimer);
      this.hubHoverTimer = null;
    }
  }

  scheduleClearHubSpawnPreview(): void {
    this.hubPreviewPinned = false;
    if (this.hubHoverTimer) clearTimeout(this.hubHoverTimer);
    this.hubHoverTimer = setTimeout(() => this.clearHubSpawnPreview(), 220);
  }

  clearHubSpawnPreview(): void {
    if (this.hubHoverTimer) {
      clearTimeout(this.hubHoverTimer);
      this.hubHoverTimer = null;
    }
    this.hubPreviewPinned = false;
    this.hubSpawnPreview.set(null);
  }

  openEditPanel(nodeId: string): void {
    const n = this.graph()?.nodes.find((x) => x.id === nodeId);
    if (!n?.monthPlanEntryId) {
      this.openCreateFrom(nodeId);
      return;
    }
    this.panelMode.set('edit');
    this.editingEntryId.set(n.monthPlanEntryId);
    this.formName.set(n.label);
    this.formKind.set(
      n.type === 'income' ? 'income' : n.type === 'investment' ? 'investment' : n.type === 'leisure' ? 'leisure' : 'expense'
    );
    this.formBlock.set(this.formKind());
    this.createStep.set('form');
    this.formRecurrence.set(n.isVariable ? 'variable' : 'fixed');
    this.formAmount.set(0);
    this.formError.set('');
    this.selectedNodeId.set(nodeId);
    this.sidePanelOpen.set(true);
  }

  requestDeleteNode(nodeId: string): void {
    if (isHubNodeId(nodeId)) return;
    const n = this.graph()?.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const entryId = n.monthPlanEntryId ?? this.parseEntryId(nodeId);
    if (!entryId) return;
    const labels: Record<string, string> = {
      income: 'recebimento',
      expense: 'gasto',
      investment: 'investimento',
      leisure: 'lazer',
      goal: 'meta',
      installment: 'parcela',
    };
    this.deletePrompt.set({
      nodeId,
      entryId,
      recurringItemId: n.recurringItemId ?? null,
      name: n.label,
      kind: n.type,
      kindLabel: labels[n.type] ?? 'item',
      isFixed: !!n.recurringItemId && !n.isVariable,
    });
  }

  requestDeleteFromPanel(): void {
    const entryId = this.editingEntryId();
    const node = this.graph()?.nodes.find((n) => n.monthPlanEntryId === entryId);
    if (node) this.requestDeleteNode(node.id);
  }

  cancelDelete(): void {
    if (this.deleteBusy()) return;
    this.deletePrompt.set(null);
  }

  confirmDelete(scope: 'month' | 'upcoming'): void {
    const prompt = this.deletePrompt();
    if (!prompt || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    const done = () => {
      this.deleteBusy.set(false);
      this.deletePrompt.set(null);
      this.selectedNodeId.set(null);
      this.nodeActions.set(null);
      this.closeSidePanel();
      this.load();
    };
    const fail = (err: { error?: { error?: string } }) => {
      this.deleteBusy.set(false);
      alert(err?.error?.error || 'Não foi possível excluir.');
    };
    if (scope === 'upcoming' && prompt.recurringItemId) {
      this.api.deleteRecurringItem(prompt.recurringItemId).subscribe({ next: done, error: fail });
      return;
    }
    if (prompt.isFixed) {
      this.api.skipMonthPlanEntry(prompt.entryId).subscribe({ next: done, error: fail });
      return;
    }
    this.api.deleteMonthPlanEntry(prompt.entryId).subscribe({ next: done, error: fail });
  }

  closeSidePanel(): void {
    this.panelMode.set('create');
    this.createStep.set('pick');
    this.formBlock.set(null);
    this.accountMode.set('new');
    this.editingEntryId.set(null);
    this.formName.set('');
    this.formAmount.set(0);
    this.formAccountId.set(null);
    this.formTargetAccountId.set(null);
    this.formLinkAccountNodeId.set(null);
    this.formSpawnX.set(null);
    this.formSpawnY.set(null);
    this.formInitialBalance.set(0);
    this.formError.set('');
    this.removeDraftPreview();
    this.sidePanelOpen.set(true);
  }

  submitCreate(): void {
    const block = this.formBlock();
    if (this.panelMode() === 'create' && (block === 'bank' || block === 'credit' || block === 'investment-account')) {
      this.submitAccount(block);
      return;
    }
    if (this.panelMode() === 'create' && block === 'totalizer') {
      this.submitTotalizer();
      return;
    }
    const name = this.formName().trim();
    const amount = Number(this.formAmount());
    if (!name) {
      this.formError.set('Informe o nome.');
      return;
    }
    if (!(amount > 0)) {
      this.formError.set('Informe um valor maior que zero.');
      return;
    }
    if (this.panelMode() === 'edit' && this.editingEntryId()) {
      this.formSaving.set(true);
      this.api
        .updateMonthPlanEntry(this.editingEntryId()!, {
          name,
          suggestedAmount: amount,
          kind: this.formKind(),
        })
        .subscribe({
          next: () => {
            this.formSaving.set(false);
            this.closeSidePanel();
            this.load();
          },
          error: (err) => {
            this.formSaving.set(false);
            this.formError.set(err?.error?.error || 'Não foi possível salvar.');
          },
        });
      return;
    }

    this.formSaving.set(true);
    this.formError.set('');
    const draftPos = this.cy?.getElementById(DRAFT_ITEM_ID);
    const draftXY =
      draftPos && draftPos.nonempty()
        ? { x: draftPos.position('x'), y: draftPos.position('y') }
        : { x: this.formSpawnX(), y: this.formSpawnY() };
    this.api
      .createAccountFlowGraphNode({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode(),
        kind: this.formKind(),
        recurrence: this.formRecurrence(),
        name,
        amount,
        currency: 'BRL',
        accountId: this.formAccountId(),
        targetAccountId: this.formTargetAccountId(),
        linkAccountNodeId: this.formLinkAccountNodeId(),
        x: draftXY.x ?? undefined,
        y: draftXY.y ?? undefined,
      })
      .subscribe({
        next: (g) => {
          this.formSaving.set(false);
          const firstBlock = this.canvasIsStarter();
          this.removeDraftPreview();
          this.closeSidePanel();
          this.graph.set(g);
          this.isEmpty.set(!g.nodes.length);
          if (!this.cy) return;
          if (firstBlock) {
            this.renderGraph(g, { skipAutoFit: true });
            this.autoOrganize();
            return;
          }
          this.renderGraph(g, { preserveView: true });
        },
        error: (err) => {
          this.formSaving.set(false);
          this.formError.set(err?.error?.error || 'Não foi possível criar.');
        },
      });
  }

  private submitAccount(block: 'bank' | 'credit' | 'investment-account'): void {
    const name = this.formName().trim();
    if (!name) {
      this.formError.set('Informe o nome.');
      return;
    }
    const type = block === 'investment-account' ? 'investment' : block;
    this.formSaving.set(true);
    this.formError.set('');
    this.api
      .saveAccount({
        name,
        type,
        currency: 'BRL',
        initialBalance: Number(this.formInitialBalance()) || 0,
        initialBalanceDate: new Date().toISOString().slice(0, 10),
        color: this.formColor(),
        creditLimit: type === 'credit' ? this.formCreditLimit() : null,
        closingDay: type === 'credit' ? this.formClosingDay() : null,
        dueDay: type === 'credit' ? this.formDueDay() : null,
      })
      .subscribe({
        next: (r) => {
          const prefix = type === 'credit' ? 'credit' : type === 'investment' ? 'inv' : 'bank';
          const x = this.formSpawnX();
          const y = this.formSpawnY();
          const finish = () => {
            this.formSaving.set(false);
            this.closeSidePanel();
            this.loadAccounts();
            this.load();
          };
          if (x == null || y == null || !r.item?.id) {
            finish();
            return;
          }
          this.api
            .saveAccountFlowGraphLayout({
              year: this.year(),
              month: this.month() + 1,
              mode: this.mode(),
              positions: [{ nodeKey: `${prefix}:${r.item.id}`, x, y }],
            })
            .subscribe({ next: finish, error: finish });
        },
        error: (err) => {
          this.formSaving.set(false);
          this.formError.set(err?.error?.error || 'Não foi possível criar a conta.');
        },
      });
  }

  private submitTotalizer(): void {
    const name = this.formName().trim();
    if (!name) {
      this.formError.set('Informe o nome.');
      return;
    }
    const amount = Number(this.formAmount()) || 0;
    this.formSaving.set(true);
    this.formError.set('');
    const firstBlock = this.canvasIsStarter();
    this.api
      .createAccountFlowGraphNode({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode(),
        kind: 'totalizer',
        recurrence: 'variable',
        name,
        amount,
        currency: 'BRL',
        x: this.formSpawnX() ?? undefined,
        y: this.formSpawnY() ?? undefined,
      })
      .subscribe({
        next: (g) => {
          this.formSaving.set(false);
          this.removeDraftPreview();
          this.closeSidePanel();
          this.graph.set(g);
          this.isEmpty.set(!g.nodes.length);
          if (!this.cy) return;
          if (firstBlock) {
            this.renderGraph(g, { skipAutoFit: true });
            this.autoOrganize();
            return;
          }
          this.renderGraph(g, { preserveView: true });
        },
        error: (err) => {
          this.formSaving.set(false);
          this.formError.set(err?.error?.error || 'Não foi possível criar o totalizador.');
        },
      });
  }

  // ── Ligar nós ───────────────────────────────────────────────────────────

  startLinkFrom(nodeId: string): void {
    this.clearHubSpawnPreview();
    this.rewire = null;
    this.linkMode.set(true);
    this.linkFromId.set(nodeId);
    this.linkHint.set('');
    this.nodeActions.set(null);
    this.applyLinkHighlight(nodeId);
    this.trackLinkPointer();
  }

  cancelLinkMode(): void {
    this.linkMode.set(false);
    this.linkFromId.set(null);
    this.linkHint.set('');
    this.edgeRewire.set(null);
    this.rewire = null;
    this.linkPointer = null;
    this.linkArrow.set(null);
    this.cy?.nodes().removeClass('link-hover');
    this.cy?.userPanningEnabled(true);
    this.untrackLinkPointer();
    this.clearLinkHighlight();
  }

  cancelEdgeRewire(): void {
    this.edgeRewire.set(null);
    this.linkHint.set('');
    this.clearLinkHighlight();
  }

  private readonly onLinkPointerMove = (ev: PointerEvent): void => {
    if (!this.linkMode()) return;
    if (this.linkPointer) {
      const dx = ev.clientX - this.linkPointer.x;
      const dy = ev.clientY - this.linkPointer.y;
      if (Math.hypot(dx, dy) > 3) this.linkPointer.moved = true;
    }
    this.paintLinkArrow(ev.clientX, ev.clientY);
  };

  private readonly onLinkPointerUp = (ev: PointerEvent): void => {
    const dragging = this.linkPointer;
    const rewire = this.rewire;
    if (!dragging && !rewire) return;
    const moved = dragging?.moved ?? true;
    this.linkPointer = null;
    window.removeEventListener('pointerup', this.onLinkPointerUp);
    this.cy?.userPanningEnabled(true);
    if (!moved && !rewire) return;
    this.swallowNextTap = true;
    const pt = this.canvasPoint(ev.clientX, ev.clientY);
    const hit = pt ? this.nodeAtCanvas(pt.x, pt.y) : null;
    this.releaseArrow(hit);
  };

  private trackLinkPointer(): void {
    window.addEventListener('pointermove', this.onLinkPointerMove);
  }

  private untrackLinkPointer(): void {
    window.removeEventListener('pointermove', this.onLinkPointerMove);
    window.removeEventListener('pointerup', this.onLinkPointerUp);
  }

  private beginArrowDrag(clientX: number, clientY: number): void {
    this.linkPointer = { moved: false, x: clientX, y: clientY };
    this.cy?.userPanningEnabled(false);
    window.addEventListener('pointerup', this.onLinkPointerUp);
    this.trackLinkPointer();
    this.paintLinkArrow(clientX, clientY);
  }

  private onEdgePointerDown(ev: EventObject): void {
    const edge = ev.target;
    if (edge.hasClass('balance-link') || edge.hasClass('draft-edge')) return;
    const oe = ev.originalEvent as MouseEvent | undefined;
    if (!oe || !this.cy) return;
    const from = String(edge.data('origFrom') || edge.source().id());
    const to = String(edge.data('origTo') || edge.target().id());
    const pt = this.canvasPoint(oe.clientX, oe.clientY);
    if (!pt) return;
    const src = edge.source().renderedBoundingBox();
    const tgt = edge.target().renderedBoundingBox();
    const scx = (src.x1 + src.x2) / 2;
    const scy = (src.y1 + src.y2) / 2;
    const tcx = (tgt.x1 + tgt.x2) / 2;
    const tcy = (tgt.y1 + tgt.y2) / 2;
    const moving = Math.hypot(pt.x - scx, pt.y - scy) < Math.hypot(pt.x - tcx, pt.y - tcy) ? 'from' : 'to';
    this.rewire = { from, to, moving };
    const fixed = moving === 'to' ? from : to;
    this.clearHubSpawnPreview();
    this.linkMode.set(true);
    this.linkFromId.set(fixed);
    this.linkHint.set('');
    this.nodeActions.set(null);
    this.applyLinkHighlight(fixed);
    this.linkPointer = { moved: true, x: oe.clientX, y: oe.clientY };
    this.cy.userPanningEnabled(false);
    window.addEventListener('pointerup', this.onLinkPointerUp);
    this.trackLinkPointer();
    this.paintLinkArrow(oe.clientX, oe.clientY);
  }

  private paintLinkArrow(clientX: number, clientY: number): void {
    if (!this.cy) return;
    const pt = this.canvasPoint(clientX, clientY);
    if (!pt) return;
    const fixedId = this.rewire
      ? this.rewire.moving === 'to'
        ? this.rewire.from
        : this.rewire.to
      : this.linkFromId();
    if (!fixedId) return;
    const node = this.cy.getElementById(fixedId);
    if (node.empty()) return;
    const bb = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
    const start = this.rectBorderPoint(bb, pt.x, pt.y);
    const hit = this.nodeAtCanvas(pt.x, pt.y);
    const valid = !!hit && hit !== fixedId && this.pairIsValid(fixedId, hit);
    this.cy.nodes().removeClass('link-hover');
    if (hit && valid) this.cy.getElementById(hit).addClass('link-hover');
    this.linkArrow.set({
      x1: start.x,
      y1: start.y,
      x2: pt.x,
      y2: pt.y,
      valid,
      head: this.arrowHead(start.x, start.y, pt.x, pt.y),
    });
  }

  private releaseArrow(hit: string | null): void {
    const rewire = this.rewire;
    this.rewire = null;
    this.linkArrow.set(null);
    this.cy?.nodes().removeClass('link-hover');
    if (rewire) {
      if (!hit) {
        this.cancelLinkMode();
        return;
      }
      const nextFrom = rewire.moving === 'from' ? hit : rewire.from;
      const nextTo = rewire.moving === 'to' ? hit : rewire.to;
      if (nextFrom === rewire.from && nextTo === rewire.to) {
        this.cancelLinkMode();
        return;
      }
      this.commitLink(nextFrom, nextTo);
      return;
    }
    const from = this.linkFromId();
    if (from && hit && hit !== from && this.pairIsValid(from, hit)) {
      this.completeLink(hit);
      return;
    }
    this.cancelLinkMode();
  }

  private pairIsValid(a: string, b: string): boolean {
    const g = this.graph();
    const aType = g?.nodes.find((n) => n.id === a)?.type ?? this.cy?.getElementById(a).data('type');
    const bType = g?.nodes.find((n) => n.id === b)?.type ?? this.cy?.getElementById(b).data('type');
    return canLinkGraphNodes(a, b, aType, bType).ok || canLinkGraphNodes(b, a, bType, aType).ok;
  }

  private canvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = this.cyRef?.nativeElement;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private nodeAtCanvas(x: number, y: number): string | null {
    if (!this.cy) return null;
    const pan = this.cy.pan();
    const zoom = this.cy.zoom() || 1;
    const mx = (x - pan.x) / zoom;
    const my = (y - pan.y) / zoom;
    let found: string | null = null;
    this.cy.nodes().forEach((n) => {
      if (found || n.hidden() || n.hasClass('draft-node') || n.hasClass('balance-node') || n.hasClass('amount-node')) {
        return;
      }
      const b = n.boundingBox();
      if (mx >= b.x1 && mx <= b.x2 && my >= b.y1 && my <= b.y2) found = n.id();
    });
    return found;
  }

  /** Ponto em que a reta do centro do bloco até o cursor cruza a borda. */
  private rectBorderPoint(
    bb: { x1: number; y1: number; x2: number; y2: number },
    tx: number,
    ty: number
  ): { x: number; y: number } {
    const cx = (bb.x1 + bb.x2) / 2;
    const cy = (bb.y1 + bb.y2) / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: bb.x2, y: cy };
    const hw = (bb.x2 - bb.x1) / 2;
    const hh = (bb.y2 - bb.y1) / 2;
    const s = Math.min(hw / Math.abs(dx), hh / Math.abs(dy));
    return { x: cx + dx * s, y: cy + dy * s };
  }

  private arrowHead(x1: number, y1: number, x2: number, y2: number): string {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = 12;
    const spread = 0.42;
    const tip = `${x2},${y2}`;
    const left = `${x2 - len * Math.cos(ang - spread)},${y2 - len * Math.sin(ang - spread)}`;
    const right = `${x2 - len * Math.cos(ang + spread)},${y2 - len * Math.sin(ang + spread)}`;
    return `${tip} ${left} ${right}`;
  }

  private commitLink(from: string, to: string): void {
    const g = this.graph();
    const fromType = g?.nodes.find((n) => n.id === from)?.type;
    const toType = g?.nodes.find((n) => n.id === to)?.type;
    const check = canLinkGraphNodes(from, to, fromType, toType);
    if (!check.ok) {
      this.linkHint.set(check.reason || 'Ligação inválida.');
      this.cancelLinkMode();
      return;
    }
    this.api
      .linkAccountFlowGraphNodes({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode(),
        fromNodeId: from,
        toNodeId: to,
      })
      .subscribe({
        next: (graph) => {
          this.cancelLinkMode();
          this.graph.set(graph);
          if (this.cy) this.renderGraph(graph, { preserveView: true });
        },
        error: (err) => {
          this.cancelLinkMode();
          alert(err?.error?.error || 'Não foi possível ligar.');
        },
      });
  }

  private completeLink(toNodeId: string): void {
    const from = this.linkFromId();
    if (!from) return;
    this.commitLink(from, toNodeId);
  }

  private applyLinkHighlight(fromId: string): void {
    if (!this.cy) return;
    const g = this.graph();
    const fromType = g?.nodes.find((n) => n.id === fromId)?.type;
    this.cy.nodes().forEach((n) => {
      if (n.hasClass('amount-node') || n.hasClass('balance-node')) return;
      const id = n.id();
      if (id === fromId) {
        n.removeClass('link-blocked dimmed').addClass('link-source highlighted');
        return;
      }
      const toType = g?.nodes.find((x) => x.id === id)?.type;
      const ok = canLinkGraphNodes(fromId, id, fromType, toType).ok;
      if (ok) {
        n.removeClass('link-blocked dimmed').addClass('link-ok');
      } else {
        n.removeClass('link-ok').addClass('link-blocked dimmed');
      }
    });
  }

  private clearLinkHighlight(): void {
    if (!this.cy) return;
    this.cy.nodes().removeClass('link-source link-ok link-blocked dimmed highlighted');
    this.cy.edges().removeClass('dimmed highlighted');
  }

  // ── Checkbox "já aconteceu" ─────────────────────────────────────────────

  toggleHappened(nodeId: string, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    const n = this.graph()?.nodes.find((x) => x.id === nodeId);
    if (!n) return;

    const prevHappened = this.happenedIds().has(nodeId);
    this.setHappenedLocal(nodeId, checked);
    this.busyConfirm.update((s) => new Set(s).add(nodeId));
    this.refreshOverlays();

    const revert = () => {
      this.setHappenedLocal(nodeId, prevHappened);
      this.clearBusy(nodeId);
      this.refreshOverlays();
    };

    if (checked) {
      const entryId = n.monthPlanEntryId ?? this.parseEntryId(nodeId);
      if (!entryId) {
        revert();
        return;
      }
      const accountId = this.linkedAccountIdFor(nodeId, n);
      this.api
        .confirmMonthPlanEntry(entryId, accountId ? { accountId } : {})
        .subscribe({
          next: () => {
            this.clearBusy(nodeId);
            this.refreshOverlays();
          },
          error: (err) => {
            revert();
            alert(err?.error?.error || 'Não foi possível confirmar.');
          },
        });
      return;
    }

    // Desmarcar — só persiste; a câmera/zoom não muda.
    if (this.mode() === 'confirmed') {
      const txId = n.transactionId ?? this.parseTxId(nodeId);
      if (!txId) {
        revert();
        return;
      }
      this.api.unconfirmTransaction(txId).subscribe({
        next: () => {
          this.clearBusy(nodeId);
          this.refreshOverlays();
        },
        error: (err) => {
          revert();
          alert(err?.error?.error || 'Não foi possível desfazer.');
        },
      });
      return;
    }

    const entryId = n.monthPlanEntryId ?? this.parseEntryId(nodeId);
    if (!entryId) {
      revert();
      return;
    }
    this.api.unconfirmMonthPlanEntry(entryId).subscribe({
      next: () => {
        this.clearBusy(nodeId);
        this.refreshOverlays();
      },
      error: (err) => {
        revert();
        alert(err?.error?.error || 'Não foi possível desfazer.');
      },
    });
  }

  private setHappenedLocal(nodeId: string, happened: boolean): void {
    this.happenedIds.update((s) => {
      const next = new Set(s);
      if (happened) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
    this.cy?.getElementById(nodeId).data('happened', happened);
  }

  private clearBusy(nodeId: string): void {
    this.busyConfirm.update((s) => {
      const n = new Set(s);
      n.delete(nodeId);
      return n;
    });
  }

  private linkedAccountIdFor(nodeId: string, n: AccountFlowGraphNode): number | undefined {
    const g = this.graph();
    if (!g) return undefined;
    if (n.type === 'income') {
      const e = g.edges.find((ed) => ed.from === nodeId);
      return e ? this.parseHubAccountId(e.to) ?? undefined : undefined;
    }
    const e = g.edges.find((ed) => ed.to === nodeId);
    return e ? this.parseHubAccountId(e.from) ?? undefined : undefined;
  }

  // ── Cytoscape ───────────────────────────────────────────────────────────

  private initCy(): void {
    if (!this.cyRef?.nativeElement) return;
    const dark = isDark();
    const edgeClr = dark ? '#9A9DAC' : '#14151A';

    this.cy = cytoscape({
      container: this.cyRef.nativeElement,
      style: [
        {
          selector: 'node',
          style: {
            shape: 'round-rectangle' as any,
            width: CARD_W,
            height: CARD_H,
            'background-color': '#FFFFFF',
            'border-color': '#E4E6EB',
            'border-width': 1,
            'corner-radius': 12,
            content: '',
            'shadow-blur': 16,
            'shadow-color': '#14151A',
            'shadow-opacity': 0.08,
            'shadow-offset-x': 0,
            'shadow-offset-y': 4,
            'z-index': 10,
          } as any,
        },
        { selector: 'node.highlighted', style: { 'border-width': 2.5 } },
        { selector: 'node.link-hover', style: { 'border-width': 3, 'border-color': '#1BAA5C' } },
        { selector: 'node.link-source', style: { 'border-width': 3, 'border-color': '#3B82F6' } },
        { selector: 'node.link-ok', style: { 'border-width': 2.5, 'border-color': '#1BAA5C' } },
        { selector: 'node.link-blocked', style: { opacity: 0.22 } },
        { selector: 'node[?unassigned]', style: { 'border-style': 'dashed' as any, opacity: 0.7 } },
        {
          selector: 'node.draft-node',
          style: {
            'border-style': 'dashed' as any,
            'border-width': 2,
            opacity: 0.92,
            'border-color': '#3B82F6',
          } as any,
        },
        {
          selector: 'edge.draft-edge',
          style: {
            'line-style': 'dashed' as any,
            'line-dash-pattern': [6, 4],
            'line-opacity': 0.55,
            'line-color': '#3B82F6',
            'target-arrow-color': '#3B82F6',
          } as any,
        },
        { selector: 'node.dimmed', style: { opacity: 0.18 } },
        {
          selector: 'node.amount-node',
          style: { width: 1, height: 1, opacity: 0, events: 'no' } as any,
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': edgeClr,
            'line-color': edgeClr,
            'line-opacity': 0.55,
            width: 1.5,
            'overlay-padding': 12,
            content: '',
            'z-index': 5,
          } as any,
        },
        {
          selector: 'node.balance-node',
          style: { width: CARD_W, height: CARD_H } as any,
        },
        {
          selector: 'edge.balance-link',
          style: {
            'line-style': 'dashed' as any,
            'line-dash-pattern': [5, 4],
            'line-opacity': 0.35,
            content: '',
            events: 'no',
          } as any,
        },
        { selector: 'edge.dashed', style: { 'line-style': 'dashed' as any, 'line-dash-pattern': [7, 5], 'line-opacity': 0.4 } },
        { selector: 'edge.highlighted', style: { width: 2.5, 'line-opacity': 1, 'z-index': 20 } },
        { selector: 'edge.dimmed', style: { opacity: 0.1 } },
      ],
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

    this.cy.on('tap', 'node', (ev) => {
      if (this.swallowNextTap) {
        this.swallowNextTap = false;
        return;
      }
      this.onNodeTap(ev);
    });
    this.cy.on('mousedown', 'edge', (ev) => this.onEdgePointerDown(ev));
    this.cy.on('tap', (ev) => {
      if (this.swallowNextTap) {
        this.swallowNextTap = false;
        return;
      }
      if (ev.target === this.cy) {
        if (this.linkMode()) {
          const pos = ev.position;
          const from = this.linkFromId();
          this.cancelLinkMode();
          if (from && isHubNodeId(from)) {
            const hub = this.parseHubAccountId(from);
            this.openCreatePanel({
              spawnX: pos.x,
              spawnY: pos.y,
              accountId: hub,
              linkAccountNodeId: from,
              kind: from.startsWith('inv:') ? 'investment' : 'expense',
            });
            if (from.startsWith('inv:') && hub) this.formTargetAccountId.set(hub);
          } else {
            this.openCreatePanel({ spawnX: pos.x, spawnY: pos.y });
          }
          return;
        }
        this.clearLinkHighlight();
        this.clearHubSpawnPreview();
        this.nodeActions.set(null);
        this.selectedNodeId.set(null);
      }
    });

    this.cy.on('dbltap', 'node', (ev) => {
      const node = ev.target;
      if (node.hasClass('amount-node') || node.hasClass('balance-node') || node.hasClass('draft-node')) return;
      if (isHubNodeId(node.id())) return;
      this.openEditPanel(node.id());
    });

    this.cy.on('dbltap', (ev) => {
      if (ev.target !== this.cy) return;
      const pos = ev.position;
      this.openCreateAtCanvas(pos.x, pos.y);
    });

    this.cy.on('mouseover', 'node', (ev) => this.onNodeMouseOver(ev));
    this.cy.on('mouseout', 'node', (ev) => this.onNodeMouseOut(ev));

    this.cy.on('dragfree', 'node', (ev) => {
      const node = ev.target;
      if (node.id() === DRAFT_ITEM_ID) {
        const p = node.position();
        this.formSpawnX.set(p.x);
        this.formSpawnY.set(p.y);
        this.refreshOverlays();
        return;
      }
      if (node.hasClass('amount-node') || node.hasClass('balance-node') || node.hasClass('draft-node')) return;
      this.queueSavePositions();
      this.refreshOverlays();
    });

    this.cy.on('pan zoom position', () => {
      this.zoomPct.set(Math.round((this.cy?.zoom() ?? 1) * 100));
      this.scheduleOverlayRefresh();
    });

    const g = this.graph();
    if (g?.nodes.length) this.renderGraph(g);
  }

  private onNodeTap(ev: EventObject): void {
    const node = ev.target;
    if (node.hasClass('amount-node') || node.hasClass('balance-node') || node.hasClass('draft-node')) return;
    const id = node.id();
    this.clearHubSpawnPreview();

    if (this.linkMode()) {
      const from = this.linkFromId();
      if (from && from !== id) {
        const fromType = this.graph()?.nodes.find((n) => n.id === from)?.type;
        const toType = this.graph()?.nodes.find((n) => n.id === id)?.type;
        const check = canLinkGraphNodes(from, id, fromType, toType);
        if (!check.ok) {
          this.linkHint.set(check.reason || 'Ligação inválida.');
          return;
        }
        this.completeLink(id);
        return;
      }
    }

    this.cy!.elements().addClass('dimmed').removeClass('highlighted');
    node.removeClass('dimmed').addClass('highlighted');
    node.connectedEdges().removeClass('dimmed').addClass('highlighted');
    node.connectedEdges().connectedNodes().removeClass('dimmed');

    this.selectedNodeId.set(id);
    const rp = node.renderedBoundingBox();
    this.nodeActions.set({
      nodeId: id,
      x: (rp.x1 + rp.x2) / 2,
      y: rp.y1,
    });
  }

  private onNodeMouseOver(ev: EventObject): void {
    const node = ev.target;
    if (node.hasClass('amount-node') || node.hasClass('balance-node')) return;
    if (this.linkMode() || this.createStep() === 'form') return;
    const id = node.id();
    if (!isHubNodeId(id)) return;
    const accountId = this.parseHubAccountId(id);
    if (!accountId) return;
    if (this.hubHoverTimer) {
      clearTimeout(this.hubHoverTimer);
      this.hubHoverTimer = null;
    }
    this.showHubSpawnPreview(node, accountId);
  }

  private onNodeMouseOut(ev: EventObject): void {
    const node = ev.target;
    if (node.hasClass('amount-node') || node.hasClass('balance-node')) return;
    if (!isHubNodeId(node.id())) return;
    if (this.hubPreviewPinned) return;
    this.scheduleClearHubSpawnPreview();
  }

  private showHubSpawnPreview(node: cytoscape.NodeSingular, accountId: number): void {
    const bb = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
    const gap = 14;
    const w = Math.max(132, (bb.x2 - bb.x1) * 0.92);
    const h = Math.max(88, (bb.y2 - bb.y1) * 1.35);
    this.hubSpawnPreview.set({
      hubNodeId: node.id(),
      accountId,
      hubType: String(node.data('type') || 'bank'),
      x: bb.x2 + gap,
      y: (bb.y1 + bb.y2) / 2 - h / 2,
      w,
      h,
    });
  }

  private updateHubSpawnPreviewPos(): void {
    const prev = this.hubSpawnPreview();
    if (!prev || !this.cy) return;
    const node = this.cy.getElementById(prev.hubNodeId);
    if (node.empty() || node.hidden()) {
      this.clearHubSpawnPreview();
      return;
    }
    this.showHubSpawnPreview(node, prev.accountId);
  }

  private renderGraph(g: AccountFlowGraph, opts?: { preserveView?: boolean; skipAutoFit?: boolean }): void {
    if (!this.cy) return;
    const preserveView = !!opts?.preserveView;
    const camera = preserveView
      ? { zoom: this.cy.zoom(), pan: { ...this.cy.pan() } }
      : null;
    const edgeClr = isDark() ? '#9A9DAC' : '#14151A';
    const elements: cytoscape.ElementDefinition[] = [];
    const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
    const amounts = this.amountsOnCards(g);
    const happenedMode = this.mode() === 'confirmed';
    const happenedLocal = this.happenedIds();

    for (const n of g.nodes) {
      const money = amounts.get(n.id) ?? (typeof n.amountBrl === 'number' ? n.amountBrl : null);
      const hub = isHubNodeId(n.id);
      const meta: Record<string, unknown> = {
        id: n.id,
        label: '',
        cardTitle: this.trunc(n.label, 26),
        cardValue: money != null ? this.fmtAmt(money) : hub ? this.hubSubtitle(n.type) : 'R$ —',
        cardMeta: money == null && hub,
        cardAccent: this.cardAccent(n.id, n.type, n.color),
        cardIcon: nodeCardIcon(n.id, n.type),
        type: n.type,
        unassigned: n.unassigned ?? false,
        editable: !!n.editable || this.isFlowNodeId(n.id),
        monthPlanEntryId: n.monthPlanEntryId ?? null,
        recurringItemId: n.recurringItemId ?? null,
        happened: happenedMode || happenedLocal.has(n.id),
      };
      elements.push({
        data: meta,
        classes: [
          n.unassigned ? 'unassigned' : '',
          meta['editable'] ? 'editable-node' : '',
        ]
          .filter(Boolean)
          .join(' '),
        position: { x: n.x, y: n.y },
      });
    }

    for (const e of g.edges) {
      const dashed = e.dashed ? 'dashed' : '';
      elements.push({
        data: {
          id: `e_${e.refId}_${e.from}_${e.to}`,
          source: e.from,
          target: e.to,
          color: edgeClr,
          amountBrl: e.amountBrl,
          kind: e.kind || '',
          subKind: e.subKind || '',
          refId: e.refId,
          origFrom: e.from,
          origTo: e.to,
          itemCategoryId: e.itemCategoryId != null ? String(e.itemCategoryId) : 'geral',
          customTabId: e.customTabId != null ? String(e.customTabId) : 'geral',
        },
        classes: dashed,
      });
    }

    // Saldos
    const bankBal = new Map<string, { label: string; inflow: number; outflow: number; destIds: Set<string> }>();
    for (const n of g.nodes.filter((n) => n.type === 'bank')) {
      bankBal.set(n.id, { label: n.label, inflow: 0, outflow: 0, destIds: new Set() });
    }
    for (const e of g.edges) {
      const srcType = nodeById.get(e.from)?.type;
      const tgtType = nodeById.get(e.to)?.type;
      if (srcType === 'income' && tgtType === 'bank') bankBal.get(e.to)!.inflow += e.amountBrl;
      if (srcType === 'bank' && bankBal.has(e.from)) {
        const b = bankBal.get(e.from)!;
        b.outflow += e.amountBrl;
        if (tgtType && ['expense', 'investment', 'goal', 'installment'].includes(tgtType)) {
          b.destIds.add(e.to);
        }
      }
    }

    for (const [bankId, b] of bankBal.entries()) {
      const bal = b.inflow - b.outflow;
      elements.push({
        data: {
          id: `__saldo_${bankId}`,
          label: '',
          cardTitle: this.trunc(b.label, 26),
          cardValue: `${bal >= 0 ? '+' : ''}${this.fmtAmt(bal)}`,
          cardMeta: false,
          cardAccent: bal >= 0 ? '#1BAA5C' : '#E5342B',
          cardIcon: ICON_BALANCE,
          type: 'balance',
          isBalance: true,
        },
        classes: 'balance-node',
      });
      if (b.destIds.size > 0) {
        for (const destId of b.destIds) {
          elements.push({
            data: {
              id: `__bl_${bankId}_${destId}`,
              source: destId,
              target: `__saldo_${bankId}`,
              color: edgeClr,
            },
            classes: 'balance-link',
          });
        }
      } else {
        elements.push({
          data: { id: `__bl_${bankId}`, source: bankId, target: `__saldo_${bankId}`, color: edgeClr },
          classes: 'balance-link',
        });
      }
    }

    const apiTotal = (g.totals?.inflowBrl ?? 0) - (g.totals?.outflowBrl ?? 0);
    elements.push({
      data: {
        id: '__saldo_total__',
        label: '',
        cardTitle: 'Total',
        cardValue: `${apiTotal >= 0 ? '+' : ''}${this.fmtAmt(apiTotal)}`,
        cardMeta: false,
        cardAccent: apiTotal >= 0 ? '#1BAA5C' : '#E5342B',
        cardIcon: ICON_BALANCE,
        type: 'balance',
        isBalance: true,
      },
      classes: 'balance-node',
    });
    for (const [bankId] of bankBal.entries()) {
      elements.push({
        data: {
          id: `__totbl_${bankId}`,
          source: `__saldo_${bankId}`,
          target: '__saldo_total__',
          color: edgeClr,
        },
        classes: 'balance-link',
      });
    }

    this.cy.elements().remove();
    this.cy.add(elements);

    if (opts?.skipAutoFit) {
      this.cy.layout({ name: 'preset', fit: false, padding: 36 } as any).run();
      this.placeSyntheticNodes();
      this.applyFilters();
      this.refreshOverlays();
      return;
    }

    const finishView = () => {
      if (preserveView && camera && this.cy) {
        this.cy.zoom(camera.zoom);
        this.cy.pan(camera.pan);
      } else {
        this.fitGraph();
      }
      this.applyFilters();
      this.refreshOverlays();
      if (
        this.sidePanelOpen() &&
        this.panelMode() === 'create' &&
        this.createStep() === 'form' &&
        this.formBlock()
      ) {
        this.syncDraftPreview();
      }
    };

    const anySaved = g.nodes.some((n) => n.positionSaved);
    if (anySaved || preserveView) {
      // Mantém posições salvas dos hubs/itens; amount/saldo sem coords vão para (0,0) —
      // reposiciona só esses sintéticos relativo aos nós âncora.
      this.cy.layout({ name: 'preset', fit: false, padding: 36 } as any).run();
      this.placeSyntheticNodes();
      setTimeout(finishView, preserveView ? 0 : 50);
    } else {
      this.runDagreTopDown(true);
    }
  }

  // ── Preview de criação (rascunho no canvas) ─────────────────────────────

  private removeDraftPreview(): void {
    this.draftAnchorKey = '';
    if (!this.cy) return;
    this.cy.getElementById(DRAFT_ITEM_ID).remove();
    this.cy.getElementById(DRAFT_AMT_ID).remove();
    this.cy.getElementById(DRAFT_E0).remove();
    this.cy.getElementById(DRAFT_E1).remove();
  }

  private syncDraftPreview(): void {
    const block = this.formBlock();
    if (!this.cy || !this.sidePanelOpen() || this.panelMode() !== 'create' || this.createStep() !== 'form' || !block) {
      this.removeDraftPreview();
      this.refreshOverlays();
      return;
    }

    const visual = this.draftVisual(block);
    const kind = this.isFlowBlock(block) ? this.formKind() : 'expense';
    const hubId = this.isFlowBlock(block) ? this.resolveDraftHubId() : null;
    const pos = this.resolveDraftPosition(kind);
    const card = {
      label: '',
      type: visual.type,
      draft: true,
      cardTitle: visual.title,
      cardValue: visual.value,
      cardMeta: visual.meta,
      cardAccent: visual.accent,
      cardIcon: visual.icon,
    };

    let item = this.cy.getElementById(DRAFT_ITEM_ID);
    const anchorKey = `${kind}|${hubId ?? ''}|${this.formSpawnX() ?? ''}|${this.formSpawnY() ?? ''}`;
    const shouldReposition = item.empty() || anchorKey !== this.draftAnchorKey;
    this.draftAnchorKey = anchorKey;

    if (item.empty()) {
      this.cy.add({
        group: 'nodes',
        data: { id: DRAFT_ITEM_ID, ...card },
        classes: 'draft-node',
        position: pos,
      });
      item = this.cy.getElementById(DRAFT_ITEM_ID);
    } else {
      item.data(card);
      if (shouldReposition) item.position(pos);
    }

    this.cy.getElementById(DRAFT_AMT_ID).remove();
    this.cy.getElementById(DRAFT_E0).remove();
    this.cy.getElementById(DRAFT_E1).remove();

    if (this.isFlowBlock(block) && hubId && this.cy.getElementById(hubId).nonempty()) {
      const hubIsSource = kind === 'expense' || kind === 'leisure' || kind === 'investment';
      this.cy.add({
        group: 'edges',
        data: {
          id: DRAFT_E0,
          source: hubIsSource ? hubId : DRAFT_ITEM_ID,
          target: hubIsSource ? DRAFT_ITEM_ID : hubId,
        },
        classes: 'draft-edge',
      });
    }

    this.refreshOverlays();
    if (shouldReposition && this.formSpawnX() == null && this.formSpawnY() == null && !hubId) {
      this.frameFirstDraft();
    }
  }

  private draftVisual(block: GraphBlockKind): {
    type: string;
    title: string;
    value: string;
    meta: boolean;
    accent: string;
    icon: string;
  } {
    if (this.isFlowBlock(block)) {
      const kind = this.formKind();
      const amount = Number(this.formAmount()) || 0;
      return {
        type: kind,
        title: this.trunc(this.formName().trim() || 'Novo item', 26),
        value: amount > 0 ? this.fmtAmt(amount) : 'R$ —',
        meta: false,
        accent: this.cardAccent(DRAFT_ITEM_ID, kind, null),
        icon: nodeCardIcon(DRAFT_ITEM_ID, kind),
      };
    }
    if (block === 'totalizer') {
      const amount = Number(this.formAmount()) || 0;
      return {
        type: 'totalizer',
        title: this.trunc(this.formName().trim() || 'Totalizador', 26),
        value: amount > 0 ? this.fmtAmt(amount) : 'R$ —',
        meta: false,
        accent: this.cardAccent('tot:0', 'totalizer', null),
        icon: nodeCardIcon('tot:0', 'totalizer'),
      };
    }
    const type = block === 'investment-account' ? 'investment' : block;
    const id = block === 'credit' ? 'credit:0' : block === 'investment-account' ? 'inv:0' : 'bank:0';
    const balance = Number(this.formInitialBalance()) || 0;
    const color = this.formColor();
    return {
      type,
      title: this.trunc(this.formName().trim() || this.blockTitle(block), 26),
      value: balance !== 0 ? this.fmtAmt(balance) : this.hubSubtitle(type),
      meta: balance === 0,
      accent: this.cardAccent(id, type, color),
      icon: nodeCardIcon(id, type),
    };
  }

  private resolveDraftHubId(): string | null {
    const link = this.formLinkAccountNodeId();
    if (link && isHubNodeId(link)) return link;
    const accountId = this.formAccountId();
    if (accountId == null || !this.cy) return null;
    for (const prefix of ['bank', 'credit'] as const) {
      const id = `${prefix}:${accountId}`;
      if (this.cy.getElementById(id).nonempty()) return id;
    }
    const target = this.formTargetAccountId();
    if (target != null) {
      const inv = `inv:${target}`;
      if (this.cy.getElementById(inv).nonempty()) return inv;
    }
    return null;
  }

  private resolveDraftPosition(kind: FormKind): { x: number; y: number } {
    const sx = this.formSpawnX();
    const sy = this.formSpawnY();
    if (sx != null && sy != null) return { x: sx, y: sy };

    const existing = this.cy?.getElementById(DRAFT_ITEM_ID);
    if (existing && existing.nonempty()) {
      return { x: existing.position('x'), y: existing.position('y') };
    }

    const hubId = this.resolveDraftHubId();
    if (hubId && this.cy) {
      const hub = this.cy.getElementById(hubId);
      if (hub.nonempty()) {
        const p = hub.position();
        const below = kind === 'expense' || kind === 'leisure' || kind === 'investment';
        return this.placeDraftClear({ x: p.x + 180, y: p.y + (below ? 110 : -110) });
      }
    }

    return this.placeDraftClear(this.defaultDraftAnchor());
  }

  /** À esquerda do total, com uma folga curta entre as bordas. */
  private defaultDraftAnchor(): { x: number; y: number } {
    if (!this.cy) return { x: 0, y: 0 };
    const total = this.cy.getElementById('__saldo_total__');
    if (total.nonempty()) {
      const p = total.position();
      // meia largura do total + folga + meia largura do rascunho
      return { x: p.x - (CARD_W + 40), y: p.y };
    }
    const ext = this.cy.extent();
    return { x: (ext.x1 + ext.x2) / 2 - 180, y: (ext.y1 + ext.y2) / 2 };
  }

  /** O rascunho não pode encostar nos blocos já existentes. */
  private placeDraftClear(start: { x: number; y: number }): { x: number; y: number } {
    if (!this.cy) return start;
    let pos = { ...start };
    for (let i = 0; i < 6; i++) {
      if (!this.draftFootprintHits(pos.x, pos.y)) return pos;
      pos = { x: pos.x - 48, y: pos.y };
    }
    return pos;
  }

  private draftFootprintHits(x: number, y: number): boolean {
    if (!this.cy) return false;
    const box = { x1: x - CARD_W / 2, y1: y - CARD_H / 2, x2: x + CARD_W / 2, y2: y + CARD_H / 2 };
    const pad = 28;
    let hit = false;
    this.cy.nodes().forEach((n) => {
      if (hit || n.hasClass('draft-node')) return;
      const b = n.boundingBox();
      if (box.x1 < b.x2 + pad && box.x2 > b.x1 - pad && box.y1 < b.y2 + pad && box.y2 > b.y1 - pad) {
        hit = true;
      }
    });
    return hit;
  }

  /** Enquadra o primeiro rascunho junto com o total. Zoom máximo: 140%. */
  private frameFirstDraft(): void {
    if (!this.cy) return;
    const others = this.cy.nodes().filter((n) => !n.hasClass('draft-node'));
    if (others.empty() || others.filter('.balance-node').length !== others.length) return;
    const focus = others.union(this.cy.nodes('.draft-node'));
    this.cy.maxZoom(1.4);
    this.cy.fit(focus, 64);
    this.cy.center(focus);
    this.zoomPct.set(Math.round(this.cy.zoom() * 100));
    this.refreshOverlays();
  }

  /** Tela só com o total (ainda sem blocos de fluxo). */
  private canvasIsStarter(): boolean {
    if (!this.cy) return false;
    const real = this.cy.nodes().filter(
      (n) => !n.hasClass('draft-node') && !n.hasClass('amount-node') && !n.hasClass('balance-node')
    );
    return real.empty();
  }

  /**
   * Layout clássico TB: recebimentos → bancos → gastos → saldos.
   */
  private runDagreTopDown(persist: boolean): void {
    if (!this.cy) return;
    this.cy
      .layout({
        name: 'dagre',
        rankDir: 'TB',
        rankSep: 72,
        nodeSep: 36,
        edgeSep: 20,
        padding: 36,
        animate: true,
        animationDuration: 450,
        animationEasing: 'ease-in-out-cubic',
        fit: false,
        stop: () => {
          this.fitGraph();
          this.applyFilters();
          this.refreshOverlays();
          if (persist) this.savePositionsNow();
        },
      } as any)
      .run();
  }

  /** Posiciona saldos quando o layout salvo só cobre os nós da API. */
  private placeSyntheticNodes(): void {
    if (!this.cy) return;
    const bandGap = 96;
    this.cy.nodes('.balance-node').forEach((bal) => {
      const incoming = bal.incomers('node');
      if (incoming.empty()) return;
      let maxY = -Infinity;
      let sumX = 0;
      let n = 0;
      incoming.forEach((src) => {
        const p = src.position();
        maxY = Math.max(maxY, p.y);
        sumX += p.x;
        n++;
      });
      bal.position({ x: n ? sumX / n : 0, y: maxY + bandGap });
    });
  }

  private queueSavePositions(): void {
    if (!this.cy) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.savePositionsNow(), 400);
  }

  private savePositionsNow(): void {
    if (!this.cy) return;
    const positions: Array<{ nodeKey: string; x: number; y: number }> = [];
    this.cy.nodes().forEach((n) => {
      const id = n.id();
      if (id.startsWith('__') || n.hasClass('amount-node') || n.hasClass('balance-node')) return;
      const p = n.position();
      positions.push({ nodeKey: id, x: p.x, y: p.y });
    });
    if (!positions.length) return;
    this.api
      .saveAccountFlowGraphLayout({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode(),
        positions,
      })
      .subscribe({ error: () => undefined });
  }

  private scheduleOverlayRefresh(): void {
    cancelAnimationFrame(this.overlayRaf);
    this.overlayRaf = requestAnimationFrame(() => this.refreshOverlays());
  }

  private refreshOverlays(): void {
    if (!this.cy) {
      this.nodeOverlays.set([]);
      this.flowCards.set([]);
      this.linkPorts.set([]);
      return;
    }
    const happenedMode = this.mode() === 'confirmed';
    const happenedLocal = this.happenedIds();
    const busy = this.busyConfirm();
    const cards: FlowCard[] = [];
    const ports: LinkPortOverlay[] = [];
    this.cy.nodes().forEach((n) => {
      if (n.hidden() || n.hasClass('amount-node')) return;
      const id = n.id();
      const bb = n.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
      const w = Math.max(1, bb.x2 - bb.x1);
      const h = Math.max(1, bb.y2 - bb.y1);
      const scale = w / CARD_W;
      const portSize = Math.round(18 * Math.max(scale, 0.35));

      cards.push({
        id,
        x: bb.x1,
        y: bb.y1,
        w,
        h,
        scale,
        title: String(n.data('cardTitle') || n.data('label') || ''),
        value: String(n.data('cardValue') || ''),
        meta: !!n.data('cardMeta'),
        accent: String(n.data('cardAccent') || '#14151A'),
        icon: String(n.data('cardIcon') || ICON_EXPENSE),
        draft: n.hasClass('draft-node'),
        dimmed: n.hasClass('dimmed'),
        check:
          n.hasClass('editable-node') && !n.hasClass('balance-node') && !n.hasClass('draft-node')
            ? {
                happened: happenedMode || happenedLocal.has(id) || !!n.data('happened'),
                busy: busy.has(id),
              }
            : null,
      });

      if (n.hasClass('balance-node') || n.hasClass('draft-node')) return;

      // Porta de ligação (estilo Excalidraw) em hubs e itens ligáveis.
      if (isHubNodeId(id) || isFlowGraphId(id) || n.hasClass('editable-node')) {
        ports.push({
          nodeId: id,
          x: bb.x2,
          y: (bb.y1 + bb.y2) / 2,
          size: portSize,
        });
      }
    });
    this.flowCards.set(cards);
    this.linkPorts.set(ports);
    this.updateHubSpawnPreviewPos();

    const actions = this.nodeActions();
    if (actions) {
      const n = this.cy.getElementById(actions.nodeId);
      if (n.nonempty() && !n.hidden()) {
        const bb = n.renderedBoundingBox();
        this.nodeActions.set({ nodeId: actions.nodeId, x: (bb.x1 + bb.x2) / 2, y: bb.y1 });
      }
    }
  }

  /** Categorias do preview: conta de investimento só oferece aporte. */
  spawnKindsForPreview(): Array<{ kind: FormKind; label: string }> {
    const prev = this.hubSpawnPreview();
    if (prev?.hubNodeId.startsWith('inv:')) {
      return HUB_SPAWN_KINDS.filter((k) => k.kind === 'investment');
    }
    const kinds: Array<{ kind: FormKind; label: string }> = [...HUB_SPAWN_KINDS];
    if (this.shouldShowLeisureOption()) kinds.push(HUB_SPAWN_KIND_LEISURE);
    return kinds;
  }

  onPortPointerDown(nodeId: string, ev: PointerEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.startLinkFrom(nodeId);
    this.beginArrowDrag(ev.clientX, ev.clientY);
  }

  // ── Toolbar / filtros ───────────────────────────────────────────────────

  fitView(): void {
    this.fitGraph();
  }
  zoomIn(): void {
    this.zoom(1.3);
  }
  zoomOut(): void {
    this.zoom(1 / 1.3);
  }

  /**
   * Reorganiza como no layout original (recebimentos no topo → gastos → saldo)
   * e sobrescreve o layout manual salvo pelo usuário.
   */
  autoOrganize(): void {
    if (!this.cy || this.cy.nodes().empty()) return;
    this.nodeActions.set(null);
    const g = this.graph();
    if (g) {
      // Força o próximo reload a aceitar as novas coords do dagre.
      this.graph.set({
        ...g,
        nodes: g.nodes.map((n) => ({ ...n, positionSaved: false })),
      });
    }
    this.runDagreTopDown(true);
    setTimeout(() => {
      const latest = this.graph();
      if (!latest || !this.cy) return;
      const pos = new Map<string, { x: number; y: number }>();
      this.cy.nodes().forEach((n) => {
        const id = n.id();
        if (id.startsWith('__') || n.hasClass('amount-node') || n.hasClass('balance-node')) return;
        const p = n.position();
        pos.set(id, { x: p.x, y: p.y });
      });
      this.graph.set({
        ...latest,
        nodes: latest.nodes.map((n) => {
          const p = pos.get(n.id);
          return p ? { ...n, x: p.x, y: p.y, positionSaved: true } : { ...n, positionSaved: true };
        }),
      });
    }, 500);
  }

  toggleFilters(): void {
    this.showFilters.update((v) => !v);
  }

  toggleType(key: string): void {
    this.filterTypes.update((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
    this.applyFilters();
  }

  toggleAccount(id: string): void {
    this.filterAccounts.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
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

  isTypeActive(k: string): boolean {
    return this.filterTypes().has(k);
  }
  isAccountActive(id: string): boolean {
    return this.filterAccounts().has(id);
  }

  applyFilters(): void {
    if (!this.cy) return;
    const types = this.filterTypes();
    const accs = this.filterAccounts();
    const noFilter = !types.size && !accs.size;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cy = this.cy as any;
    if (noFilter) {
      cy.elements().show();
      this.refreshOverlays();
      return;
    }
    cy.edges().forEach((e: any) => {
      if (e.hasClass('balance-link')) return;
      const d = e.data();
      const typeOk = !types.size || types.has(d.kind) || types.has(d.subKind);
      const accOk =
        !accs.size ||
        accs.has(d.origFrom) ||
        accs.has(d.origTo) ||
        accs.has(e.source().id()) ||
        accs.has(e.target().id());
      typeOk && accOk ? e.show() : e.hide();
    });
    cy.nodes().forEach((n: any) => {
      if (n.hasClass('balance-node')) return;
      const visible = n
        .connectedEdges()
        .filter((e: any) => !e.hasClass('balance-link'))
        .some((e: any) => !e.hidden());
      visible ? n.show() : n.hide();
    });
    this.refreshOverlays();
  }

  /** Encaixa o grafo. Sem blocos, o zoom não passa de 140%; com fluxo, o automático para em 180%. */
  private fitGraph(padding = 36): void {
    if (!this.cy) return;
    const starter = this.canvasIsStarter();
    this.cy.maxZoom(starter ? 1.4 : 4);
    this.cy.fit(undefined, padding);
    const cap = starter ? 1.4 : 1.8;
    if (this.cy.zoom() > cap) {
      this.cy.zoom({
        level: cap,
        renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
      });
      this.cy.center();
    }
    this.zoomPct.set(Math.round(this.cy.zoom() * 100));
  }

  private zoom(factor: number): void {
    if (!this.cy) return;
    const center = { x: this.cy.width() / 2, y: this.cy.height() / 2 };
    this.cy.zoom({ level: this.cy.zoom() * factor, renderedPosition: center });
  }

  /** Valor que aparece dentro do cartão do item (não no banco). */
  private amountsOnCards(g: AccountFlowGraph): Map<string, number> {
    const types = new Map(g.nodes.map((n) => [n.id, n.type]));
    const map = new Map<string, number>();
    for (const n of g.nodes) {
      if (typeof n.amountBrl === 'number' && n.amountBrl > 0 && !isHubNodeId(n.id)) {
        map.set(n.id, n.amountBrl);
      }
    }
    for (const e of g.edges) {
      if (e.subKind === 'totalizer') continue;
      const placement = amountPlacement(types.get(e.from) ?? '', types.get(e.to) ?? '', e.from, e.to);
      const owner =
        placement === 'after-target'
          ? e.to
          : isFlowGraphId(e.from) || e.from.startsWith('tot:')
            ? e.from
            : e.to;
      if (!isHubNodeId(owner)) map.set(owner, e.amountBrl);
    }
    return map;
  }

  /** Cor do quadrado do ícone: cor da conta, ou a cor do tipo. */
  private cardAccent(id: string, type: string, color?: string | null): string {
    if ((id.startsWith('bank:') || id.startsWith('credit:') || id.startsWith('inv:')) && color) {
      return color;
    }
    const map: Record<string, string> = {
      income: '#1BAA5C',
      expense: '#E5342B',
      leisure: '#E5342B',
      installment: '#E5342B',
      investment: '#5A3FD1',
      goal: '#B5760A',
      transfer: '#5B5E6B',
      totalizer: '#0F766E',
      bank: color || '#14151A',
      credit: color || '#F59E0B',
    };
    return map[type] || color || '#14151A';
  }

  private hubSubtitle(type: string): string {
    if (type === 'credit') return 'Cartão';
    if (type === 'investment') return 'Investimento';
    return 'Banco';
  }

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

  private parseHubAccountId(nodeId: string): number | null {
    const m = /^(bank|credit|inv):(\d+)$/.exec(nodeId);
    return m ? Number(m[2]) : null;
  }

  private parseEntryId(nodeId: string): number | null {
    const m = /^(inc|exp|flow|xfer|goal|unassigned):(\d+)$/.exec(nodeId);
    return m ? Number(m[2]) : null;
  }

  private parseTxId(nodeId: string): number | null {
    const m = /^tx(?:-out|-xfer)?:(\d+)$/.exec(nodeId);
    return m ? Number(m[1]) : null;
  }

  private isFlowNodeId(id: string): boolean {
    return isFlowGraphId(id);
  }
}
