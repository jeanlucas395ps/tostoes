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
  AccountFlowGraphEdge,
  AccountFlowGraphMode,
  AccountFlowGraphNode,
  FinancialAccount,
} from '../../core/models/api.models';
import {
  accountFlowBalances,
  canEditGraphNode,
  canLinkGraphNodes,
  cardAmounts,
  edgeAmountKey,
  edgeVisibleForFilters,
  editDraftForNode,
  isFlowNodeId as isFlowGraphId,
  isHubNodeId,
  nodeVisibleForFilters,
  rewireDrop,
  spawnLinkFromNode,
} from '../../core/utils/account-graph-mapping.util';
import {
  ICON_BALANCE,
  ICON_BANK,
  ICON_CARD,
  ICON_EXPENSE,
  ICON_GOAL,
  ICON_INCOME,
  ICON_INV,
  ICON_MAXIMIZE,
  ICON_TOTAL,
  ICON_TRANSFER,
  ICON_TREND,
  nodeCardIcon,
} from '../../core/utils/flow-icons';

cytoscape.use(dagre);

const CARD_W = 228;
const CARD_H = 76;

type ExtendedMode = AccountFlowGraphMode;
type FormKind = 'income' | 'expense' | 'investment' | 'transfer' | 'goal';
type GraphBlockKind = FormKind | 'bank' | 'credit' | 'investment-account' | 'totalizer';

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

/**
 * Preview de próximo bloco ao hover:
 * recebimento → banco | banco/cartão/investimento → gasto | gasto → nenhum.
 */
interface HubSpawnPreview {
  sourceNodeId: string;
  /** Tipo sugerido ao clicar no preview. */
  suggest: 'bank' | 'expense';
  title: string;
  subtitle: string;
  accent: string;
  icon: string;
  accountId: number | null;
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

interface InlineCardEdit {
  nodeId: string;
  name: string;
  amount: number;
  saving: boolean;
}

interface LinkPortOverlay {
  nodeId: string;
  x: number;
  y: number;
  /** Escala visual (zoom do card); base do botão é 18×18. */
  scale: number;
}

interface DeletePrompt {
  nodeId: string;
  entryId: number;
  recurringItemId: number | null;
  name: string;
  kind: string;
  kindLabel: string;
  isFixed: boolean;
  /** Banco/cartão/conta investimento no grafo. */
  isHub?: boolean;
  accountId?: number | null;
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
  readonly iconMaximize = ICON_MAXIMIZE;
  private cy: Core | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private viewportSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayRaf = 0;
  private hubHoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hubPreviewPinned = false;
  private nodeTapTimer: ReturnType<typeof setTimeout> | null = null;
  /** Evita gravar viewport enquanto aplicamos zoom/pan programático. */
  private applyingCamera = false;
  /** Após arrastar da paleta, o browser dispara click — não abrir formulário de novo. */
  private suppressBlockClick = false;
  /** Tipo em arraste (dataTransfer falha em alguns browsers; campo é confiável). */
  private draggingBlock: GraphBlockKind | null = null;

  private static readonly GRAPH_BLOCKS = new Set<GraphBlockKind>([
    'income',
    'expense',
    'investment',
    'transfer',
    'goal',
    'bank',
    'credit',
    'investment-account',
    'totalizer',
  ]);

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
  /** Tipo da conta hub ao editar banco/investimento (API: bank | investment). */
  formAccountType = signal<'bank' | 'investment'>('bank');
  formCreditLimit = signal<number | null>(null);
  formClosingDay = signal<number | null>(1);
  formDueDay = signal<number | null>(10);
  formAccountId = signal<number | null>(null);
  formTargetAccountId = signal<number | null>(null);
  /** Datas da meta (YYYY-MM-DD). */
  formStartDate = signal('');
  formEndDate = signal('');
  formError = signal('');
  formSaving = signal(false);
  formSpawnX = signal<number | null>(null);
  formSpawnY = signal<number | null>(null);
  formLinkAccountNodeId = signal<string | null>(null);
  editingEntryId = signal<number | null>(null);
  /** Conta hub criada por drag — painel edita via PUT /accounts/:id. */
  editingAccountId = signal<number | null>(null);
  /** Hub `bank:N` sendo configurado (editar ou trocar por outro). */
  replacingHubId = signal<string | null>(null);

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
  inlineEdit = signal<InlineCardEdit | null>(null);

  formKindOptions = computed(() => {
    const opts: Array<{ value: FormKind; label: string }> = [
      { value: 'income', label: 'Recebimento' },
      { value: 'expense', label: 'Gasto' },
      { value: 'investment', label: 'Investimento / aporte' },
      { value: 'transfer', label: 'Transferência' },
    ];
    if (this.formBlock() === 'goal' || this.formKind() === 'goal') {
      opts.push({ value: 'goal', label: 'Meta' });
    }
    return opts;
  });

  totals = computed(() => this.graph()?.totals ?? null);
  unassignedCnt = computed(() => this.graph()?.unassigned.length ?? 0);

  panelTitle = computed(() => {
    if (this.panelMode() === 'edit') {
      if (this.formBlock() === 'bank' && this.accountMode() === 'pick') return 'Configurar banco';
      if (this.editingAccountId() || this.replacingHubId()) {
        return this.formBlock() === 'bank' ? 'Editar banco' : 'Editar conta';
      }
      return 'Editar item';
    }
    if (this.createStep() === 'pick') return 'O que adicionar?';
    return this.blockTitle(this.formBlock());
  });
  panelKicker = computed(() => {
    if (this.panelMode() === 'edit') {
      if (this.formBlock() === 'bank' && this.accountMode() === 'pick') {
        return 'Editar dados ou trocar a conta';
      }
      if (this.editingAccountId() || this.replacingHubId()) return 'Já no grafo · ajuste e salve';
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
  /** Destino de recebimento: banco ou investimento. */
  incomeAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'bank' || a.type === 'investment')
  );
  /** Origem de gasto: banco, cartão ou investimento. */
  paymentAccounts = computed(() =>
    this.accounts().filter(
      (a) => a.type === 'bank' || a.type === 'credit' || a.type === 'investment'
    )
  );
  /** Contas do select principal conforme o tipo do item. */
  primaryFormAccounts = computed(() => {
    const kind = this.formKind();
    if (kind === 'income') return this.incomeAccounts();
    if (kind === 'expense') return this.paymentAccounts();
    if (kind === 'investment') return this.bankAccounts();
    return this.bankAndCreditAccounts();
  });
  bankAccounts = computed(() => this.accounts().filter((a) => a.type === 'bank'));
  /** Outros bancos para trocar no card selecionado (exclui o atual). */
  otherBankAccounts = computed(() => {
    const current = this.editingAccountId();
    return this.bankAccounts().filter((a) => a.id !== current);
  });
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
    if (this.viewportSaveTimer) clearTimeout(this.viewportSaveTimer);
    if (this.hubHoverTimer) clearTimeout(this.hubHoverTimer);
    if (this.nodeTapTimer) clearTimeout(this.nodeTapTimer);
    cancelAnimationFrame(this.overlayRaf);
    this.cy?.destroy();
    this.cy = null;
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
    this.flowCards.set([]);
    this.linkPorts.set([]);
    const y = this.year();
    const m = this.month() + 1;
    const mode = this.mode();
    this.api.getAccountFlowGraph(y, m, mode).subscribe({
      next: (g) => {
        this.graph.set(g);
        this.isEmpty.set(!g.nodes.length);
        if (!g.nodes.length) {
          this.loading.set(false);
          this.cy?.elements().remove();
          return;
        }
        // Mantém loading até o zoom salvo — mas nunca trava se o cy ainda não montou.
        this.renderGraphWhenReady(g);
      },
      error: () => {
        this.graph.set(null);
        this.loading.set(false);
        this.isEmpty.set(true);
        this.cy?.elements().remove();
        this.nodeOverlays.set([]);
        this.flowCards.set([]);
        this.linkPorts.set([]);
      },
    });
  }

  /** Renderiza quando o cytoscape existir; evita loading infinito se a API voltar antes do AfterViewInit. */
  private renderGraphWhenReady(g: AccountFlowGraph, attempt = 0): void {
    if (this.cy) {
      try {
        this.renderGraph(g);
      } catch {
        this.loading.set(false);
      }
      return;
    }
    if (attempt >= 30) {
      this.loading.set(false);
      return;
    }
    requestAnimationFrame(() => this.renderGraphWhenReady(g, attempt + 1));
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
    this.editingAccountId.set(null);
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
    const n = this.graph()?.nodes.find((x) => x.id === nodeId);
    const link = spawnLinkFromNode(nodeId, n, this.graph()?.edges ?? []);
    const source = this.cy?.getElementById(nodeId);
    const sx = source && source.nonempty() ? source.position('x') : 160;
    const sy = source && source.nonempty() ? source.position('y') : 120;
    const below = link.kind === 'expense' || link.kind === 'investment';
    this.spawnBlockImmediate(link.kind, sx + 180, sy + (below ? 110 : -110), {
      accountId: link.accountId,
      targetAccountId: link.targetAccountId,
      linkAccountNodeId: link.linkAccountNodeId,
    });
  }

  canEditNode(nodeId: string): boolean {
    return canEditGraphNode(nodeId);
  }

  /** Clique no preview: cria o bloco já ligado e abre detalhes. */
  acceptSpawnPreview(): void {
    const prev = this.hubSpawnPreview();
    if (!prev) return;
    const source = this.cy?.getElementById(prev.sourceNodeId);
    const sx = source && source.nonempty() ? source.position('x') : null;
    const sy = source && source.nonempty() ? source.position('y') : null;
    const spawnX = sx != null ? sx + (prev.suggest === 'bank' ? 220 : 40) : 160;
    const spawnY = sy != null ? sy + (prev.suggest === 'expense' ? 120 : 0) : 120;
    this.clearHubSpawnPreview();

    if (prev.suggest === 'bank') {
      this.spawnBlockImmediate('bank', spawnX, spawnY, {
        linkAccountNodeId: prev.sourceNodeId,
      });
      return;
    }

    this.spawnBlockImmediate('expense', spawnX, spawnY, {
      accountId: prev.accountId,
      linkAccountNodeId: prev.sourceNodeId,
    });
  }

  /** Clique na paleta: cria na hora no centro do canvas (igual ao arraste). */
  chooseBlock(block: GraphBlockKind): void {
    if (this.suppressBlockClick) return;
    if (!this.cy) {
      this.spawnBlockImmediate(block, 160, 120);
      return;
    }
    const pan = this.cy.pan();
    const zoom = this.cy.zoom() || 1;
    const x = (this.cy.width() / 2 - pan.x) / zoom;
    const y = (this.cy.height() / 2 - pan.y) / zoom;
    this.spawnBlockImmediate(block, x, y);
  }

  backToTypePick(): void {
    this.createStep.set('pick');
    this.formBlock.set(null);
    this.accountMode.set('new');
    this.formError.set('');
  }

  /** Coloca no grafo um banco que já existe, na posição do arraste. */
  placeExistingBank(account: FinancialAccount): void {
    const x = this.formSpawnX() ?? 160;
    const y = this.formSpawnY() ?? 120;
    const linkFrom = this.formLinkAccountNodeId();
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
          const finish = () => {
            this.formSaving.set(false);
            this.closeSidePanel();
            this.load();
          };
          if (linkFrom && (linkFrom.startsWith('inc:') || linkFrom.startsWith('tx:'))) {
            this.api
              .linkAccountFlowGraphNodes({
                year: this.year(),
                month: this.month() + 1,
                mode: this.mode(),
                fromNodeId: linkFrom,
                toNodeId: `bank:${account.id}`,
              })
              .subscribe({ next: finish, error: finish });
            return;
          }
          finish();
        },
        error: () => {
          this.formSaving.set(false);
          this.formError.set('Não foi possível colocar o banco no grafo.');
        },
      });
  }


  private blockTitle(block: GraphBlockKind | null): string {
    const map: Record<string, string> = {
      income: 'Novo recebimento',
      expense: 'Novo gasto',
      investment: 'Novo aporte',
      transfer: 'Nova transferência',
      goal: 'Nova meta',
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
        icon: ICON_INCOME,
      },
      {
        id: 'expense',
        label: 'Gasto',
        hint: 'Sai de uma conta ou cartão',
        icon: ICON_EXPENSE,
      },
      {
        id: 'investment',
        label: 'Aporte',
        hint: 'Da conta para um investimento',
        icon: ICON_TREND,
      },
      {
        id: 'transfer',
        label: 'Transferência',
        hint: 'Entre duas contas',
        icon: ICON_TRANSFER,
      },
      {
        id: 'goal',
        label: 'Meta',
        hint: 'Objetivo com prazo e destino',
        icon: ICON_GOAL,
      },
    ];
    return [
      { title: 'Movimentos', items: moves },
      {
        title: 'Contas',
        items: [
          {
            id: 'bank',
            label: 'Banco',
            hint: 'Conta bancária',
            icon: ICON_BANK,
          },
          {
            id: 'credit',
            label: 'Cartão de crédito',
            hint: 'Limite, fecha e vence',
            icon: ICON_CARD,
          },
          {
            id: 'investment-account',
            label: 'Conta de investimento',
            hint: 'Aportes, recebimentos e gastos',
            icon: ICON_INV,
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
            icon: ICON_TOTAL,
          },
        ],
      },
    ];
  }

  onBlockDragStart(block: GraphBlockKind, ev: DragEvent): void {
    this.suppressBlockClick = true;
    this.draggingBlock = block;
    ev.dataTransfer?.setData('application/x-graph-block', block);
    ev.dataTransfer?.setData('text/plain', block);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  }

  onBlockDragEnd(): void {
    // drop dispara antes do dragend; limpa no próximo tick.
    setTimeout(() => {
      this.draggingBlock = null;
      this.suppressBlockClick = false;
    }, 80);
  }

  onCanvasDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  }

  onCanvasDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.suppressBlockClick = true;
    const raw = (
      this.draggingBlock ||
      ev.dataTransfer?.getData('application/x-graph-block') ||
      ev.dataTransfer?.getData('text/plain') ||
      ''
    )
      .trim()
      .split(/\s+/)[0];
    this.draggingBlock = null;
    const block = raw as GraphBlockKind;
    if (!AccountGraphComponent.GRAPH_BLOCKS.has(block) || !this.cy || !this.cyRef) {
      setTimeout(() => {
        this.suppressBlockClick = false;
      }, 80);
      return;
    }
    const rect = this.cyRef.nativeElement.getBoundingClientRect();
    const pan = this.cy.pan();
    const zoom = this.cy.zoom() || 1;
    const x = (ev.clientX - rect.left - pan.x) / zoom;
    const y = (ev.clientY - rect.top - pan.y) / zoom;
    this.spawnBlockImmediate(block, x, y);
    setTimeout(() => {
      this.suppressBlockClick = false;
    }, 80);
  }

  /** Cria o bloco de imediato no grafo e abre o painel de detalhes. */
  spawnBlockImmediate(
    block: GraphBlockKind,
    x: number,
    y: number,
    opts?: {
      accountId?: number | null;
      targetAccountId?: number | null;
      linkAccountNodeId?: string | null;
    }
  ): void {
    this.cancelLinkMode();
    this.clearHubSpawnPreview();
    this.inlineEdit.set(null);
    this.panelMode.set('create');
    this.createStep.set('pick');
    this.formBlock.set(null);
    this.editingEntryId.set(null);
    this.editingAccountId.set(null);
    this.replacingHubId.set(null);
    this.formSpawnX.set(x);
    this.formSpawnY.set(y);
    this.formLinkAccountNodeId.set(opts?.linkAccountNodeId ?? null);
    this.formAccountId.set(opts?.accountId ?? null);
    this.formTargetAccountId.set(opts?.targetAccountId ?? null);
    this.formError.set('');
    this.formSaving.set(true);
    this.sidePanelOpen.set(true);

    if (block === 'bank' || block === 'credit' || block === 'investment-account') {
      this.createAccountImmediate(block, x, y, opts?.linkAccountNodeId ?? null);
      return;
    }
    if (block === 'totalizer') {
      this.createFlowImmediate(
        'totalizer',
        this.nextGenericName('Novo totalizador', this.graphNodeLabels()),
        0,
        x,
        y,
        opts
      );
      return;
    }
    if (block === 'goal') {
      // Meta exige destino e valor final — abre o formulário (não cria genérico).
      this.formSaving.set(false);
      this.panelMode.set('create');
      this.createStep.set('form');
      this.formBlock.set('goal');
      this.formKind.set('goal');
      this.formRecurrence.set('variable');
      this.formName.set(this.nextGenericName('Nova meta', this.graphNodeLabels()));
      this.formAmount.set(0);
      this.formStartDate.set(this.defaultGoalStartDate());
      this.formEndDate.set(this.defaultGoalEndDate());
      this.formAccountId.set(opts?.accountId ?? this.formAccountId());
      this.formTargetAccountId.set(opts?.targetAccountId ?? this.formTargetAccountId());
      return;
    }
    const defaults: Record<Exclude<FormKind, 'goal'>, { name: string; amount: number }> = {
      income: { name: 'Novo recebimento', amount: 1 },
      expense: { name: 'Novo gasto', amount: 1 },
      investment: { name: 'Novo aporte', amount: 1 },
      transfer: { name: 'Nova transferência', amount: 1 },
    };
    const d = defaults[block];
    this.createFlowImmediate(
      block,
      this.nextGenericName(d.name, this.graphNodeLabels()),
      d.amount,
      x,
      y,
      opts
    );
  }

  private defaultGoalStartDate(): string {
    const y = this.year();
    const m = this.month() + 1;
    return `${y}-${String(m).padStart(2, '0')}-01`;
  }

  private defaultGoalEndDate(): string {
    const start = new Date(this.defaultGoalStartDate() + 'T12:00:00');
    start.setMonth(start.getMonth() + 11);
    const y = start.getFullYear();
    const m = start.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }

  /** Nomes já usados no grafo (para contador implícito). */
  private graphNodeLabels(): string[] {
    return (this.graph()?.nodes ?? []).map((n) => n.label).filter(Boolean);
  }

  /**
   * Gera nome único: "Novo banco", depois "Novo banco 2", "Novo banco 3"…
   * Evita erro de duplicidade na API ao criar itens genéricos.
   */
  private nextGenericName(base: string, taken: Iterable<string>): string {
    const used = new Set(
      [...taken].map((n) => n.trim().toLowerCase()).filter((n) => n.length > 0)
    );
    const baseKey = base.trim().toLowerCase();
    if (!used.has(baseKey)) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base} ${i}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${Date.now()}`;
  }

  /** Cria conta genérica na hora (banco/cartão/investimento) e abre edição. */
  private createAccountImmediate(
    block: 'bank' | 'credit' | 'investment-account',
    x: number,
    y: number,
    linkFrom: string | null
  ): void {
    const type = block === 'investment-account' ? 'investment' : block;
    const bases = {
      bank: 'Novo banco',
      credit: 'Novo cartão',
      'investment-account': 'Nova conta de investimento',
    } as const;
    const colors = { bank: '#3b82f6', credit: '#f59e0b', 'investment-account': '#a371f7' } as const;
    this.formAccountType.set(type === 'investment' ? 'investment' : 'bank');

    const createWithAccounts = (accountNames: string[]) => {
      const name = this.nextGenericName(bases[block], [
        ...accountNames,
        ...this.graphNodeLabels(),
      ]);
      this.api
        .saveAccount({
          name,
          type,
          currency: 'BRL',
          initialBalance: 0,
          initialBalanceDate: new Date().toISOString().slice(0, 10),
          color: colors[block],
          creditLimit: type === 'credit' ? 0 : null,
          closingDay: type === 'credit' ? 1 : null,
          dueDay: type === 'credit' ? 10 : null,
        })
        .subscribe({
          next: (r) => {
            const prefix = type === 'credit' ? 'credit' : type === 'investment' ? 'inv' : 'bank';
            const hubId = r.item?.id ? `${prefix}:${r.item.id}` : null;
            const finish = () => {
              this.formSaving.set(false);
              this.loadAccounts();
              this.api.getAccountFlowGraph(this.year(), this.month() + 1, this.mode()).subscribe({
                next: (g) => {
                  this.graph.set(g);
                  this.isEmpty.set(!g.nodes.length);
                  if (this.cy) this.renderGraph(g, { preserveView: true });
                  if (hubId && r.item) {
                    this.openAccountEditPanel(block, r.item, hubId);
                  } else {
                    this.closeSidePanel();
                  }
                },
                error: () => {
                  this.formSaving.set(false);
                  this.closeSidePanel();
                  this.load();
                },
              });
            };
            const afterLayout = () => {
              if (
                hubId &&
                linkFrom &&
                (linkFrom.startsWith('inc:') || linkFrom.startsWith('tx:')) &&
                prefix === 'bank'
              ) {
                this.api
                  .linkAccountFlowGraphNodes({
                    year: this.year(),
                    month: this.month() + 1,
                    mode: this.mode(),
                    fromNodeId: linkFrom,
                    toNodeId: hubId,
                  })
                  .subscribe({ next: finish, error: finish });
                return;
              }
              finish();
            };
            if (!hubId) {
              finish();
              return;
            }
            this.api
              .saveAccountFlowGraphLayout({
                year: this.year(),
                month: this.month() + 1,
                mode: this.mode(),
                positions: [{ nodeKey: hubId, x, y }],
              })
              .subscribe({ next: afterLayout, error: afterLayout });
          },
          error: (err) => {
            this.formSaving.set(false);
            this.formError.set(err?.error?.error || 'Não foi possível criar a conta.');
            this.createStep.set('pick');
            this.panelMode.set('create');
          },
        });
    };

    // Lista atualizada evita colisão se this.accounts() estiver defasado.
    this.api.getAccounts().subscribe({
      next: (r) => {
        const items = r.items ?? [];
        this.accounts.set(items);
        createWithAccounts(items.map((a) => a.name));
      },
      error: () => createWithAccounts(this.accounts().map((a) => a.name)),
    });
  }

  private createFlowImmediate(
    kind: Exclude<FormKind, 'goal'> | 'totalizer',
    name: string,
    amount: number,
    x: number,
    y: number,
    opts?: {
      accountId?: number | null;
      targetAccountId?: number | null;
      linkAccountNodeId?: string | null;
    }
  ): void {
    const prevIds = new Set((this.graph()?.nodes ?? []).map((n) => n.id));
    const viewingConfirmed = this.mode() === 'confirmed';
    this.api
      .createAccountFlowGraphNode({
        year: this.year(),
        month: this.month() + 1,
        mode: viewingConfirmed ? 'current' : this.mode(),
        kind,
        recurrence: 'variable',
        name,
        amount,
        currency: 'BRL',
        accountId: opts?.accountId ?? this.formAccountId(),
        targetAccountId: opts?.targetAccountId ?? this.formTargetAccountId(),
        linkAccountNodeId: opts?.linkAccountNodeId ?? this.formLinkAccountNodeId(),
        x,
        y,
      })
      .subscribe({
        next: (g) => {
          const finish = (graph: AccountFlowGraph) => {
            this.formSaving.set(false);
            this.graph.set(graph);
            this.isEmpty.set(!graph.nodes.length);
            if (this.cy) this.renderGraph(graph, { preserveView: true });
            const created =
              graph.nodes.find((n) => !prevIds.has(n.id) && n.label === name) ??
              graph.nodes.find((n) => !prevIds.has(n.id));
            if (created && canEditGraphNode(created.id)) {
              this.openEditPanel(created.id);
            } else {
              this.closeSidePanel();
            }
          };
          if (viewingConfirmed) {
            this.confirmFreshNode(g, name);
            return;
          }
          finish(g);
        },
        error: (err) => {
          this.formSaving.set(false);
          this.formError.set(err?.error?.error || 'Não foi possível criar o bloco.');
          this.createStep.set('pick');
          this.panelMode.set('create');
        },
      });
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
    if (!canEditGraphNode(nodeId)) return;
    const g = this.graph();
    const n = g?.nodes.find((x) => x.id === nodeId);
    const draft = n ? editDraftForNode(n, g?.edges ?? []) : null;
    const entryId = n?.monthPlanEntryId ?? this.parseEntryId(nodeId);
    if (!n || !entryId || !draft) {
      // Sem preview: não abre formulário de criação fantasma.
      return;
    }
    this.panelMode.set('edit');
    this.editingEntryId.set(entryId);
    this.editingAccountId.set(null);
    this.formName.set(n.label);
    this.formKind.set(draft.kind);
    this.formBlock.set(draft.kind);
    this.createStep.set('form');
    this.formRecurrence.set(draft.recurrence);
    this.formAmount.set(draft.amount);
    this.formAccountId.set(draft.accountId);
    this.formTargetAccountId.set(draft.targetAccountId);
    this.formError.set('');
    this.formSaving.set(false);
    this.selectedNodeId.set(nodeId);
    this.sidePanelOpen.set(true);
  }

  /** Painel para editar banco/cartão/investimento recém-criado (ou selecionado). */
  openAccountEditPanel(
    block: 'bank' | 'credit' | 'investment-account',
    account: FinancialAccount,
    hubId: string
  ): void {
    this.panelMode.set('edit');
    this.editingEntryId.set(null);
    this.editingAccountId.set(account.id);
    this.replacingHubId.set(block === 'bank' || block === 'investment-account' ? hubId : null);
    this.formBlock.set(block);
    this.createStep.set('form');
    this.accountMode.set('new');
    this.formName.set(account.name);
    this.formAccountType.set(
      account.type === 'investment' || block === 'investment-account' ? 'investment' : 'bank'
    );
    this.formColor.set(account.color || (block === 'credit' ? '#f59e0b' : block === 'investment-account' ? '#a371f7' : '#3b82f6'));
    this.formInitialBalance.set(Number(account.initialBalanceBrl ?? account.initialBalance ?? 0) || 0);
    this.formCreditLimit.set(account.creditLimit != null ? Number(account.creditLimit) : null);
    this.formClosingDay.set(account.closingDay ?? 1);
    this.formDueDay.set(account.dueDay ?? 10);
    this.formError.set('');
    this.formSaving.set(false);
    this.selectedNodeId.set(hubId);
    this.sidePanelOpen.set(true);
  }

  /** Clique no card de banco: escolher editar ou trocar a conta. */
  openBankConfigPanel(account: FinancialAccount, hubId: string): void {
    this.panelMode.set('edit');
    this.editingEntryId.set(null);
    this.editingAccountId.set(account.id);
    this.replacingHubId.set(hubId);
    this.formBlock.set('bank');
    this.createStep.set('form');
    this.accountMode.set('pick');
    this.formName.set(account.name);
    this.formAccountType.set(account.type === 'investment' ? 'investment' : 'bank');
    this.formColor.set(account.color || '#3b82f6');
    this.formInitialBalance.set(Number(account.initialBalanceBrl ?? account.initialBalance ?? 0) || 0);
    this.formError.set('');
    this.formSaving.set(false);
    this.selectedNodeId.set(hubId);
    const node = this.cy?.getElementById(hubId);
    if (node && node.nonempty()) {
      this.formSpawnX.set(node.position('x'));
      this.formSpawnY.set(node.position('y'));
    }
    this.sidePanelOpen.set(true);
  }

  beginEditBankDetails(): void {
    this.accountMode.set('new');
    this.formError.set('');
  }

  /** Volta da ficha do banco para a escolha editar/trocar. */
  backToBankConfig(): void {
    const hub = this.replacingHubId();
    if (!hub?.startsWith('bank:')) {
      this.closeSidePanel();
      return;
    }
    const id = Number(/^bank:(\d+)$/.exec(hub)?.[1] ?? 0);
    const account = this.accounts().find((a) => a.id === id);
    if (!account) {
      this.closeSidePanel();
      return;
    }
    this.openBankConfigPanel(account, hub);
  }

  startCreateReplacementBank(): void {
    this.editingAccountId.set(null);
    this.accountMode.set('new');
    this.formName.set('');
    this.formColor.set('#3b82f6');
    this.formInitialBalance.set(0);
    this.formError.set('');
  }

  /** Troca o hub do grafo por outro banco, mantendo ligações e posição. */
  replaceBankHub(account: FinancialAccount): void {
    const fromHub = this.replacingHubId();
    if (!fromHub?.startsWith('bank:')) return;
    const toHub = `bank:${account.id}`;
    if (fromHub === toHub) {
      this.beginEditBankDetails();
      return;
    }
    const g = this.graph();
    const flowIds = [
      ...new Set(
        (g?.edges ?? [])
          .filter((e) => e.from === fromHub || e.to === fromHub)
          .map((e) => (e.from === fromHub ? e.to : e.from))
          .filter(
            (id) =>
              !isHubNodeId(id) &&
              !id.startsWith('__') &&
              (isFlowGraphId(id) || id.startsWith('tot:') || id.startsWith('tx'))
          )
      ),
    ];
    const fromEl = this.cy?.getElementById(fromHub);
    const x =
      this.formSpawnX() ??
      (fromEl && fromEl.nonempty() ? fromEl.position('x') : 160);
    const y =
      this.formSpawnY() ??
      (fromEl && fromEl.nonempty() ? fromEl.position('y') : 120);
    const year = this.year();
    const month = this.month() + 1;
    const mode = this.mode();

    this.formSaving.set(true);
    this.formError.set('');

    const finish = () => {
      this.formSaving.set(false);
      this.closeSidePanel();
      this.loadAccounts();
      this.load();
    };

    const saveLayoutThenFinish = () => {
      this.api
        .saveAccountFlowGraphLayout({
          year,
          month,
          mode,
          positions: [{ nodeKey: toHub, x, y }],
        })
        .subscribe({ next: finish, error: finish });
    };

    const linkNext = (i: number) => {
      if (i >= flowIds.length) {
        saveLayoutThenFinish();
        return;
      }
      this.api
        .linkAccountFlowGraphNodes({
          year,
          month,
          mode,
          fromNodeId: flowIds[i],
          toNodeId: toHub,
        })
        .subscribe({
          next: () => linkNext(i + 1),
          error: () => linkNext(i + 1),
        });
    };

    linkNext(0);
  }

  requestDeleteNode(nodeId: string): void {
    if (nodeId.startsWith('__') || nodeId.startsWith('balance:')) return;
    const n = this.graph()?.nodes.find((x) => x.id === nodeId);

    if (isHubNodeId(nodeId)) {
      const m = /^(bank|credit|inv):(\d+)$/.exec(nodeId);
      if (!m) return;
      const hubLabels: Record<string, string> = {
        bank: 'banco',
        credit: 'cartão',
        inv: 'conta de investimento',
      };
      this.deletePrompt.set({
        nodeId,
        entryId: 0,
        recurringItemId: null,
        name: n?.label ?? 'Conta',
        kind: m[1],
        kindLabel: hubLabels[m[1]] ?? 'conta',
        isFixed: false,
        isHub: true,
        accountId: Number(m[2]),
      });
      return;
    }

    if (!n) return;
    const entryId = n.monthPlanEntryId ?? this.parseEntryId(nodeId);
    if (!entryId) return;
    const labels: Record<string, string> = {
      income: 'recebimento',
      expense: 'gasto',
      investment: 'investimento',
      goal: 'meta',
      installment: 'parcela',
      totalizer: 'totalizador',
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
      this.loadAccounts();
      this.load();
    };
    const fail = (err: { error?: { error?: string } }) => {
      this.deleteBusy.set(false);
      alert(err?.error?.error || 'Não foi possível excluir.');
    };
    if (prompt.isHub && prompt.accountId) {
      this.api.deleteAccount(prompt.accountId).subscribe({ next: done, error: fail });
      return;
    }
    if (this.mode() === 'confirmed') {
      const node = this.graph()?.nodes.find((n) => n.id === prompt.nodeId);
      const txId = node?.transactionId ?? this.parseTxId(prompt.nodeId);
      if (!txId) {
        this.deleteBusy.set(false);
        alert('Não foi possível desfazer este lançamento.');
        return;
      }
      this.api.unconfirmTransaction(txId).subscribe({ next: done, error: fail });
      return;
    }
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
    this.editingAccountId.set(null);
    this.replacingHubId.set(null);
    this.formName.set('');
    this.formAmount.set(0);
    this.formAccountId.set(null);
    this.formTargetAccountId.set(null);
    this.formStartDate.set('');
    this.formEndDate.set('');
    this.formLinkAccountNodeId.set(null);
    this.formSpawnX.set(null);
    this.formSpawnY.set(null);
    this.formInitialBalance.set(0);
    this.formError.set('');
    this.sidePanelOpen.set(true);
  }

  submitCreate(): void {
    const block = this.formBlock();
    if (
      (block === 'bank' || block === 'credit' || block === 'investment-account') &&
      (this.editingAccountId() || this.replacingHubId() || this.panelMode() === 'create')
    ) {
      this.submitAccount(block);
      return;
    }
    if (this.panelMode() === 'create' && block === 'totalizer') {
      this.submitTotalizer();
      return;
    }
    if (this.panelMode() === 'create' && (block === 'goal' || this.formKind() === 'goal')) {
      this.submitGoal();
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
    if (this.formKind() === 'transfer') {
      const from = this.formAccountId();
      const to = this.formTargetAccountId();
      if (from && to && from === to) {
        this.formError.set('Conta de saída e entrada devem ser diferentes.');
        return;
      }
    }
    if (this.panelMode() === 'edit' && this.editingEntryId()) {
      const editing = this.graph()?.nodes.find((n) => n.monthPlanEntryId === this.editingEntryId());
      const draft = editing ? editDraftForNode(editing, this.graph()?.edges ?? []) : null;
      const nameOnly = draft?.mode === 'goal' || draft?.mode === 'totalizer';
      if (!nameOnly && !(amount > 0)) {
        this.formError.set('Informe um valor maior que zero.');
        return;
      }
      if (
        draft?.mode === 'flow' &&
        this.formRecurrence() === 'fixed' &&
        this.formKind() === 'investment' &&
        !this.formTargetAccountId()
      ) {
        this.formError.set('Investimento fixo precisa da conta de destino.');
        return;
      }
      this.formSaving.set(true);
      this.api
        .updateAccountFlowGraphNode({
          year: this.year(),
          month: this.month() + 1,
          mode: this.mode(),
          entryId: this.editingEntryId()!,
          nodeId: editing?.id,
          name,
          amount: nameOnly ? undefined : amount,
          kind: (() => {
            const k = this.formKind();
            if (draft?.mode !== 'flow' || k === 'goal') return undefined;
            return k;
          })(),
          recurrence: draft?.mode === 'flow' ? this.formRecurrence() : undefined,
          currency: 'BRL',
          accountId: draft?.mode === 'flow' ? this.formAccountId() : null,
          targetAccountId: draft?.mode === 'flow' ? this.formTargetAccountId() : null,
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
    const viewingConfirmed = this.mode() === 'confirmed';
    const flowKind = this.formKind();
    if (flowKind === 'goal') {
      this.submitGoal();
      return;
    }
    this.api
      .createAccountFlowGraphNode({
        year: this.year(),
        month: this.month() + 1,
        mode: viewingConfirmed ? 'current' : this.mode(),
        kind: flowKind,
        recurrence: this.formRecurrence(),
        name,
        amount,
        currency: 'BRL',
        accountId: this.formAccountId(),
        targetAccountId: this.formTargetAccountId(),
        linkAccountNodeId: this.formLinkAccountNodeId(),
        x: this.formSpawnX() ?? undefined,
        y: this.formSpawnY() ?? undefined,
      })
      .subscribe({
        next: (g) => {
          if (viewingConfirmed) {
            this.confirmFreshNode(g, name);
            return;
          }
          this.formSaving.set(false);
          const firstBlock = this.canvasIsStarter();
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

  /** Cria no plano do mês e confirma, para o item aparecer em Apenas confirmados. */
  private confirmFreshNode(planned: AccountFlowGraph, name: string): void {
    const prev = new Set((this.graph()?.nodes ?? []).map((n) => n.id));
    const created =
      planned.nodes.find((n) => n.monthPlanEntryId && !prev.has(n.id) && n.label === name) ??
      planned.nodes.find((n) => n.monthPlanEntryId && !prev.has(n.id));
    const finish = () => {
      this.formSaving.set(false);
      this.closeSidePanel();
      this.load();
    };
    if (!created?.monthPlanEntryId) {
      finish();
      return;
    }
    this.api
      .confirmMonthPlanEntry(created.monthPlanEntryId, {
        accountId: this.formAccountId() ?? undefined,
        targetAccountId: this.formTargetAccountId() ?? undefined,
        amount: Number(this.formAmount()),
      })
      .subscribe({
        next: finish,
        error: (err) => {
          this.formSaving.set(false);
          this.formError.set(err?.error?.error || 'Criado no plano, mas não entrou em Apenas confirmados.');
          this.load();
        },
      });
  }

  private removeNodeFromGraph(nodeId: string): void {
    const g = this.graph();
    if (!g || !this.cy) {
      this.refreshOverlays();
      return;
    }
    const next: AccountFlowGraph = {
      ...g,
      nodes: g.nodes.filter((n) => n.id !== nodeId),
      edges: g.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    };
    this.graph.set(next);
    this.renderGraph(next, { preserveView: true });
  }

  private submitAccount(block: 'bank' | 'credit' | 'investment-account'): void {
    const name = this.formName().trim();
    if (!name) {
      this.formError.set('Informe o nome.');
      return;
    }
    const type: 'bank' | 'credit' | 'investment' =
      block === 'credit' ? 'credit' : this.formAccountType();
    const editingId = this.editingAccountId();
    const prevHub = this.selectedNodeId() ?? this.replacingHubId();
    this.formSaving.set(true);
    this.formError.set('');
    this.api
      .saveAccount(
        {
          name,
          type,
          currency: 'BRL',
          initialBalance: Number(this.formInitialBalance()) || 0,
          initialBalanceDate: new Date().toISOString().slice(0, 10),
          color: this.formColor(),
          creditLimit: type === 'credit' ? this.formCreditLimit() : null,
          closingDay: type === 'credit' ? this.formClosingDay() : null,
          dueDay: type === 'credit' ? this.formDueDay() : null,
        },
        editingId ?? undefined
      )
      .subscribe({
        next: (r) => {
          if (editingId) {
            const prefix = type === 'credit' ? 'credit' : type === 'investment' ? 'inv' : 'bank';
            const newHub = `${prefix}:${editingId}`;
            const finishEdit = () => {
              this.formSaving.set(false);
              this.closeSidePanel();
              this.loadAccounts();
              this.load();
            };
            // Se mudou banco ↔ investimento, migra posição e remove a chave antiga.
            if (prevHub && prevHub !== newHub) {
              const el = this.cy?.getElementById(prevHub);
              const x =
                el && el.nonempty() ? el.position('x') : this.formSpawnX() ?? 160;
              const y =
                el && el.nonempty() ? el.position('y') : this.formSpawnY() ?? 120;
              // Conta investimento não tem totalizador — remove saldo do hub antigo.
              const oldSaldo = `__saldo_${prevHub}`;
              this.api
                .saveAccountFlowGraphLayout({
                  year: this.year(),
                  month: this.month() + 1,
                  mode: this.mode(),
                  positions: [{ nodeKey: newHub, x, y }],
                  removeNodeKeys: [prevHub, oldSaldo],
                })
                .subscribe({ next: finishEdit, error: finishEdit });
              return;
            }
            finishEdit();
            return;
          }
          // Cadastrou outro banco no lugar do hub selecionado.
          if (block === 'bank' && this.replacingHubId()?.startsWith('bank:') && r.item) {
            this.replaceBankHub(r.item);
            return;
          }
          const prefix = type === 'credit' ? 'credit' : type === 'investment' ? 'inv' : 'bank';
          const x = this.formSpawnX();
          const y = this.formSpawnY();
          const linkFrom = this.formLinkAccountNodeId();
          const hubId = r.item?.id ? `${prefix}:${r.item.id}` : null;
          const finish = () => {
            this.formSaving.set(false);
            this.closeSidePanel();
            this.loadAccounts();
            this.load();
          };
          const maybeLinkThenFinish = () => {
            if (
              hubId &&
              linkFrom &&
              (linkFrom.startsWith('inc:') || linkFrom.startsWith('tx:')) &&
              prefix === 'bank'
            ) {
              this.api
                .linkAccountFlowGraphNodes({
                  year: this.year(),
                  month: this.month() + 1,
                  mode: this.mode(),
                  fromNodeId: linkFrom,
                  toNodeId: hubId,
                })
                .subscribe({ next: finish, error: finish });
              return;
            }
            finish();
          };
          if (x == null || y == null || !hubId) {
            maybeLinkThenFinish();
            return;
          }
          this.api
            .saveAccountFlowGraphLayout({
              year: this.year(),
              month: this.month() + 1,
              mode: this.mode(),
              positions: [{ nodeKey: hubId, x, y }],
            })
            .subscribe({ next: maybeLinkThenFinish, error: maybeLinkThenFinish });
        },
        error: (err) => {
          this.formSaving.set(false);
          this.formError.set(err?.error?.error || 'Não foi possível criar a conta.');
        },
      });
  }

  private submitGoal(): void {
    const name = this.formName().trim();
    const target = Number(this.formAmount());
    const start = this.formStartDate() || this.defaultGoalStartDate();
    const end = this.formEndDate() || this.defaultGoalEndDate();
    if (!name) {
      this.formError.set('Informe o nome.');
      return;
    }
    if (!(target > 0)) {
      this.formError.set('Informe o valor final da meta.');
      return;
    }
    if (!this.formTargetAccountId()) {
      this.formError.set('Selecione a conta de investimento de destino.');
      return;
    }
    if (start > end) {
      this.formError.set('A data de início deve ser anterior à data de fim.');
      return;
    }
    this.formSaving.set(true);
    this.formError.set('');
    const firstBlock = this.canvasIsStarter();
    this.api
      .createAccountFlowGraphNode({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode() === 'confirmed' ? 'current' : this.mode(),
        kind: 'goal',
        name,
        amount: target,
        targetAmountBrl: target,
        startDate: start,
        endDate: end,
        accountId: this.formAccountId(),
        targetAccountId: this.formTargetAccountId(),
        color: this.formColor() || '#00AB55',
        x: this.formSpawnX() ?? undefined,
        y: this.formSpawnY() ?? undefined,
      })
      .subscribe({
        next: (g) => {
          this.formSaving.set(false);
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
          this.formError.set(err?.error?.error || 'Não foi possível criar a meta.');
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
      const decision = rewireDrop(rewire.from, rewire.to, hit);
      if (decision.action === 'cancel') {
        this.cancelLinkMode();
        return;
      }
      if (decision.action === 'unlink') {
        this.unlinkEdge(rewire.from, rewire.to);
        return;
      }
      this.commitLink(decision.from, decision.to);
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

  private unlinkEdge(from: string, to: string): void {
    this.api
      .unlinkAccountFlowGraphNodes({
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
          alert(err?.error?.error || 'Não foi possível desligar.');
        },
      });
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
          this.removeNodeFromGraph(nodeId);
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
            content: 'data(amountLabel)',
            'font-size': 11,
            color: edgeClr,
            'text-background-color': '#ffffff',
            'text-background-opacity': 1,
            'text-background-padding': '3px',
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
          this.cancelLinkMode();
          return;
        }
        this.clearLinkHighlight();
        this.clearHubSpawnPreview();
        this.nodeActions.set(null);
        this.selectedNodeId.set(null);
      }
    });

    this.cy.on('dbltap', 'node', (ev) => {
      if (this.nodeTapTimer) {
        clearTimeout(this.nodeTapTimer);
        this.nodeTapTimer = null;
      }
      const node = ev.target;
      if (node.hasClass('amount-node') || node.hasClass('balance-node') || node.hasClass('draft-node')) return;
      if (isHubNodeId(node.id())) return;
      this.startInlineEdit(node.id());
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
      if (node.hasClass('amount-node') || node.hasClass('draft-node')) return;
      // Persiste na hora: estado local + API (qualquer bloco que o usuário moveu).
      this.persistNodePosition(node);
      this.refreshOverlays();
    });

    this.cy.on('position', () => this.scheduleOverlayRefresh());
    this.cy.on('pan zoom', () => {
      this.zoomPct.set(Math.round((this.cy?.zoom() ?? 1) * 100));
      this.scheduleOverlayRefresh();
      if (!this.applyingCamera) this.queueSaveViewport();
    });

    const g = this.graph();
    if (g?.nodes.length) this.renderGraphWhenReady(g);
    else if (!this.loading()) this.loading.set(false);
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

    if (this.nodeTapTimer) clearTimeout(this.nodeTapTimer);
    this.nodeTapTimer = setTimeout(() => {
      this.nodeTapTimer = null;
      if (this.inlineEdit()?.nodeId === id) return;
      if (canEditGraphNode(id)) {
        this.openEditPanel(id);
        return;
      }
      if (isHubNodeId(id)) {
        this.openHubAccountEdit(id);
        return;
      }
      this.closeSidePanel();
    }, 260);
  }

  /** Clique em banco/cartão/investimento: painel de edição da conta. */
  openHubAccountEdit(hubId: string): void {
    const m = /^(bank|credit|inv):(\d+)$/.exec(hubId);
    if (!m) return;
    const accountId = Number(m[2]);
    const account = this.accounts().find((a) => a.id === accountId);
    if (!account) {
      this.api.getAccounts().subscribe({
        next: (r) => {
          this.accounts.set(r.items ?? []);
          const found = (r.items ?? []).find((a) => a.id === accountId);
          if (found) this.openHubAccountEdit(hubId);
        },
      });
      return;
    }
    if (m[1] === 'bank') {
      this.openBankConfigPanel(account, hubId);
      return;
    }
    if (m[1] === 'inv') {
      // Mesmo fluxo de edição do banco, com tipo investimento pré-selecionado.
      this.openAccountEditPanel('investment-account', account, hubId);
      return;
    }
    this.openAccountEditPanel('credit', account, hubId);
  }

  startInlineEdit(nodeId: string): void {
    if (!canEditGraphNode(nodeId)) return;
    const g = this.graph();
    const n = g?.nodes.find((x) => x.id === nodeId);
    if (!n?.monthPlanEntryId) {
      this.openEditPanel(nodeId);
      return;
    }
    const draft = editDraftForNode(n, g?.edges ?? []);
    this.inlineEdit.set({
      nodeId,
      name: n.label,
      amount: draft?.amount ?? n.amountBrl ?? 0,
      saving: false,
    });
    this.nodeActions.set(null);
    this.clearHubSpawnPreview();
    setTimeout(() => {
      const input = document.querySelector('.flow-card--editing .flow-card-input--title') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
  }

  onInlineName(value: string): void {
    const cur = this.inlineEdit();
    if (!cur) return;
    this.inlineEdit.set({ ...cur, name: value });
  }

  onInlineAmount(value: number): void {
    const cur = this.inlineEdit();
    if (!cur) return;
    this.inlineEdit.set({ ...cur, amount: value });
  }

  commitInlineEdit(): void {
    const edit = this.inlineEdit();
    if (!edit || edit.saving) return;
    const g = this.graph();
    const n = g?.nodes.find((x) => x.id === edit.nodeId);
    if (!n?.monthPlanEntryId) {
      this.inlineEdit.set(null);
      return;
    }
    const name = edit.name.trim();
    if (!name) {
      this.inlineEdit.set(null);
      return;
    }
    const draft = editDraftForNode(n, g?.edges ?? []);
    const nameOnly = draft?.mode === 'goal' || draft?.mode === 'totalizer';
    const amount = Number(edit.amount);
    if (!nameOnly && !(amount > 0)) {
      this.inlineEdit.set(null);
      return;
    }
    this.inlineEdit.set({ ...edit, saving: true });
    this.api
      .updateAccountFlowGraphNode({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode(),
        entryId: n.monthPlanEntryId,
        nodeId: n.id,
        name,
        amount: nameOnly ? amount : amount,
        kind: draft?.mode === 'flow' ? draft.kind : undefined,
        currency: 'BRL',
        accountId: draft?.mode === 'flow' ? draft.accountId : null,
        targetAccountId: draft?.mode === 'flow' ? draft.targetAccountId : null,
      })
      .subscribe({
        next: (graph) => {
          this.inlineEdit.set(null);
          this.graph.set(graph);
          if (this.cy) this.renderGraph(graph, { preserveView: true });
          if (this.editingEntryId() === n.monthPlanEntryId) {
            this.formName.set(name);
            this.formAmount.set(amount);
          }
        },
        error: () => this.inlineEdit.set(null),
      });
  }

  cancelInlineEdit(): void {
    this.inlineEdit.set(null);
  }

  onInlineFocusOut(ev: FocusEvent): void {
    const box = ev.currentTarget as HTMLElement | null;
    const next = ev.relatedTarget as Node | null;
    if (box && next && box.contains(next)) return;
    // Deixa o foco migrar entre os dois inputs antes de salvar.
    setTimeout(() => {
      if (!this.inlineEdit()) return;
      const active = document.activeElement;
      if (box && active && box.contains(active)) return;
      this.commitInlineEdit();
    }, 0);
  }

  private onNodeMouseOver(ev: EventObject): void {
    const node = ev.target;
    if (node.hasClass('amount-node') || node.hasClass('balance-node') || node.hasClass('draft-node')) {
      return;
    }
    // Não bloquear com o painel aberto — senão o preview recebimento→banco some.
    if (this.linkMode() || this.formSaving()) return;
    if (this.hubHoverTimer) {
      clearTimeout(this.hubHoverTimer);
      this.hubHoverTimer = null;
    }
    this.showSpawnPreviewFor(node);
  }

  private onNodeMouseOut(ev: EventObject): void {
    const node = ev.target;
    if (node.hasClass('amount-node') || node.hasClass('balance-node') || node.hasClass('draft-node')) {
      return;
    }
    if (this.hubPreviewPinned) return;
    this.scheduleClearHubSpawnPreview();
  }

  /** Sugestão: recebimento→banco, banco/cartão/investimento→gasto; gasto→nenhum. */
  private spawnSuggestionFor(node: cytoscape.NodeSingular): {
    suggest: 'bank' | 'expense';
    title: string;
    subtitle: string;
    accent: string;
    icon: string;
    accountId: number | null;
  } | null {
    const id = node.id();
    const type = String(node.data('type') || '');
    if (type === 'goal') return null;
    if (id.startsWith('exp:') || type === 'expense' || type === 'installment') {
      return null;
    }
    if (id.startsWith('inc:') || type === 'income') {
      return {
        suggest: 'bank',
        title: 'Banco',
        subtitle: 'Clique para vincular',
        accent: '#3b82f6',
        icon: ICON_BANK,
        accountId: null,
      };
    }
    if (
      id.startsWith('bank:') ||
      id.startsWith('credit:') ||
      id.startsWith('inv:') ||
      type === 'bank' ||
      type === 'credit' ||
      (type === 'investment' && id.startsWith('inv:'))
    ) {
      const accountId = this.parseHubAccountId(id);
      if (!accountId) return null;
      const isCredit = id.startsWith('credit:') || type === 'credit';
      const isInv = id.startsWith('inv:');
      return {
        suggest: 'expense',
        title: 'Gasto',
        subtitle: isCredit ? 'Saindo do cartão' : isInv ? 'Saindo do investimento' : 'Saindo do banco',
        accent: '#E5342B',
        icon: ICON_EXPENSE,
        accountId,
      };
    }
    return null;
  }

  private showSpawnPreviewFor(node: cytoscape.NodeSingular): void {
    const suggestion = this.spawnSuggestionFor(node);
    if (!suggestion) {
      this.clearHubSpawnPreview();
      return;
    }
    const bb = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
    const gap = 14;
    const w = Math.max(148, Math.min(200, bb.x2 - bb.x1));
    const h = Math.max(76, Math.min(96, bb.y2 - bb.y1));
    this.hubSpawnPreview.set({
      sourceNodeId: node.id(),
      suggest: suggestion.suggest,
      title: suggestion.title,
      subtitle: suggestion.subtitle,
      accent: suggestion.accent,
      icon: suggestion.icon,
      accountId: suggestion.accountId,
      x: bb.x2 + gap,
      y: (bb.y1 + bb.y2) / 2 - h / 2,
      w,
      h,
    });
  }

  private updateHubSpawnPreviewPos(): void {
    const prev = this.hubSpawnPreview();
    if (!prev || !this.cy) return;
    const node = this.cy.getElementById(prev.sourceNodeId);
    if (node.empty() || node.hidden()) {
      this.clearHubSpawnPreview();
      return;
    }
    this.showSpawnPreviewFor(node);
  }

  private renderGraph(g: AccountFlowGraph, opts?: { preserveView?: boolean; skipAutoFit?: boolean }): void {
    if (!this.cy) return;
    const preserveView = !!opts?.preserveView;
    const camera = preserveView
      ? { zoom: this.cy.zoom(), pan: { ...this.cy.pan() } }
      : null;
    const edgeClr = isDark() ? '#9A9DAC' : '#14151A';
    const elements: cytoscape.ElementDefinition[] = [];
    const amounts = cardAmounts(g.nodes, g.edges);
    const happenedMode = this.mode() === 'confirmed';
    const happenedLocal = this.happenedIds();

    for (const n of g.nodes) {
      const money = amounts.byNode.get(n.id) ?? (typeof n.amountBrl === 'number' ? n.amountBrl : null);
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
        happened: happenedMode || !!n.occurred || happenedLocal.has(n.id),
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
          amountLabel: amounts.hubEdgeAmounts.has(edgeAmountKey(e))
            ? this.fmtAmt(amounts.hubEdgeAmounts.get(edgeAmountKey(e))!)
            : '',
          origFrom: e.from,
          origTo: e.to,
          itemCategoryId: e.itemCategoryId != null ? String(e.itemCategoryId) : 'geral',
          customTabId: e.customTabId != null ? String(e.customTabId) : 'geral',
        },
        classes: dashed,
      });
    }

    const syn = g.syntheticLayout ?? {};
    const accountBals = accountFlowBalances(g.nodes, g.edges);
    for (const b of accountBals) {
      const balId = `__saldo_${b.accountId}`;
      const pinned = syn[balId];
      elements.push({
        data: {
          id: balId,
          label: '',
          cardTitle: this.trunc(`Total: ${b.label}`, 28),
          cardValue: `${b.balance >= 0 ? '+' : ''}${this.fmtAmt(b.balance)}`,
          cardMeta: false,
          cardAccent: b.balance >= 0 ? '#1BAA5C' : '#E5342B',
          cardIcon: ICON_BALANCE,
          type: 'balance',
          isBalance: true,
        },
        classes: 'balance-node',
        ...(pinned ? { position: { x: pinned.x, y: pinned.y } } : {}),
      });
      if (b.destIds.length > 0) {
        for (const destId of b.destIds) {
          elements.push({
            data: {
              id: `__bl_${b.accountId}_${destId}`,
              source: destId,
              target: balId,
              color: edgeClr,
            },
            classes: 'balance-link',
          });
        }
      } else {
        elements.push({
          data: { id: `__bl_${b.accountId}`, source: b.accountId, target: balId, color: edgeClr },
          classes: 'balance-link',
        });
      }
    }

    const apiTotal = (g.totals?.inflowBrl ?? 0) - (g.totals?.outflowBrl ?? 0);
    const totalPinned = syn['__saldo_total__'];
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
      ...(totalPinned ? { position: { x: totalPinned.x, y: totalPinned.y } } : {}),
    });
    for (const b of accountBals) {
      elements.push({
        data: {
          id: `__totbl_${b.accountId}`,
          source: `__saldo_${b.accountId}`,
          target: '__saldo_total__',
          color: edgeClr,
        },
        classes: 'balance-link',
      });
    }

    try {
      this.cy.elements().remove();
      this.cy.add(elements);
    } catch {
      this.loading.set(false);
      return;
    }

    if (opts?.skipAutoFit) {
      this.cy.layout({ name: 'preset', fit: false, padding: 36 } as any).run();
      this.placeSyntheticNodes(g);
      this.applySavedOrFitCamera(g, { preserveView, camera });
      this.applyFilters();
      this.refreshOverlays();
      this.loading.set(false);
      return;
    }

    const finishView = () => {
      try {
        this.applySavedOrFitCamera(g, { preserveView, camera });
        this.applyFilters();
        this.refreshOverlays();
      } finally {
        this.loading.set(false);
      }
    };

    // Só reorganiza automaticamente se NENHUMA posição foi salva pelo usuário.
    // Qualquer layout persistido (nós ou sintéticos) deve ser respeitado no F5.
    const anySaved =
      g.nodes.some((n) => n.positionSaved) ||
      Object.keys(g.syntheticLayout ?? {}).length > 0 ||
      !!g.viewport;
    if (anySaved || preserveView) {
      this.cy.layout({ name: 'preset', fit: false, padding: 36 } as any).run();
      this.placeSyntheticNodes(g);
      // Aplica zoom salvo na hora (sem setTimeout) para não piscar zoom alto → baixo.
      finishView();
    } else {
      this.runDagreTopDown(true);
    }
  }

  /** Zoom/pan salvos do usuário, câmera atual, ou fit automático. */
  private applySavedOrFitCamera(
    g: AccountFlowGraph,
    opts?: {
      preserveView?: boolean;
      camera?: { zoom: number; pan: { x: number; y: number } } | null;
    }
  ): void {
    if (!this.cy) return;
    this.applyingCamera = true;
    try {
      if (opts?.preserveView && opts.camera) {
        this.cy.zoom(opts.camera.zoom);
        this.cy.pan(opts.camera.pan);
      } else if (
        g.viewport &&
        Number.isFinite(g.viewport.zoom) &&
        g.viewport.zoom > 0
      ) {
        this.cy.zoom(g.viewport.zoom);
        this.cy.pan({ x: g.viewport.x, y: g.viewport.y });
      } else {
        this.fitGraph();
      }
      this.zoomPct.set(Math.round((this.cy.zoom() ?? 1) * 100));
    } finally {
      // Libera no próximo tick para ignorar eventos pan/zoom do apply.
      setTimeout(() => {
        this.applyingCamera = false;
      }, 0);
    }
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
   * Layout clássico TB: recebimentos → bancos → gastos.
   * Saldos/Total ficam travados — posição só muda se o usuário arrastar.
   */
  private runDagreTopDown(persist: boolean): void {
    if (!this.cy) {
      this.loading.set(false);
      return;
    }
    const locked = this.cy.nodes('.balance-node');
    locked.lock();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      locked.unlock();
      this.placeSyntheticNodes(this.graph());
      const g = this.graph();
      if (g) this.applySavedOrFitCamera(g);
      else this.fitGraph();
      this.applyFilters();
      this.refreshOverlays();
      this.loading.set(false);
      if (persist) this.savePositionsNow();
    };
    // Se o stop do dagre não disparar, não deixa a tela em loading eterno.
    setTimeout(finish, 1200);
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
        stop: finish,
      } as any)
      .run();
  }

  /**
   * Saldos automáticos (banco×gastos) e Total final:
   * - se já tem posição salva → aplica e NÃO recalcula
   * - senão → coloca uma vez, grava no syntheticLayout e persiste
   * Assim o auto-layout deixa de empurrar Total/totalizador a cada render.
   */
  private placeSyntheticNodes(graph?: AccountFlowGraph | null): void {
    if (!this.cy) return;
    // API + local: não deixar um syntheticLayout vazio do reload apagar pins locais.
    const saved: Record<string, { x: number; y: number }> = {
      ...(this.graph()?.syntheticLayout ?? {}),
      ...(graph?.syntheticLayout ?? {}),
    };
    const bandGap = 96;
    let changed = false;

    const placeOnce = (bal: cytoscape.NodeSingular, preferNonBalanceAnchors: boolean) => {
      const id = bal.id();
      const pinned = saved[id];
      if (pinned && Number.isFinite(pinned.x) && Number.isFinite(pinned.y)) {
        bal.position({ x: pinned.x, y: pinned.y });
        return;
      }

      const incoming = bal.incomers('node');
      let x = bal.position('x');
      let y = bal.position('y');
      const alreadyPlaced = Math.abs(x) > 0.5 || Math.abs(y) > 0.5;

      if (!incoming.empty() && !alreadyPlaced) {
        const anchors = preferNonBalanceAnchors
          ? incoming.filter((n) => !n.hasClass('balance-node'))
          : incoming;
        const use = anchors.nonempty() ? anchors : incoming;
        let maxY = -Infinity;
        let sumX = 0;
        let n = 0;
        use.forEach((src) => {
          const p = src.position();
          maxY = Math.max(maxY, p.y);
          sumX += p.x;
          n++;
        });
        if (n > 0) {
          x = sumX / n;
          y = maxY + bandGap;
          bal.position({ x, y });
        }
      }

      const p = bal.position();
      saved[id] = { x: p.x, y: p.y };
      changed = true;
    };

    // 1) Saldos por conta (âncora = banco/fluxo, não outro saldo)
    this.cy.nodes('.balance-node').forEach((bal) => {
      if (bal.id() === '__saldo_total__') return;
      placeOnce(bal, true);
    });
    // 2) Total final (âncora = saldos das contas), só se ainda não estiver fixo
    const total = this.cy.getElementById('__saldo_total__');
    if (total.nonempty()) placeOnce(total, false);

    if (!changed) return;

    const g = this.graph();
    if (g) {
      this.graph.set({ ...g, syntheticLayout: { ...saved } });
    }
    this.queueSavePositions();
  }

  /** Atualiza um nó movido no estado local e agenda o save completo. */
  private persistNodePosition(node: cytoscape.NodeSingular): void {
    const id = node.id();
    const p = node.position();
    const g = this.graph();
    if (g && !id.startsWith('__')) {
      this.graph.set({
        ...g,
        nodes: g.nodes.map((n) =>
          n.id === id ? { ...n, x: p.x, y: p.y, positionSaved: true } : n
        ),
      });
    } else if (g && (id.startsWith('__saldo') || id.startsWith('__amt_'))) {
      this.graph.set({
        ...g,
        syntheticLayout: {
          ...(g.syntheticLayout ?? {}),
          [id]: { x: p.x, y: p.y },
        },
      });
    }
    this.queueSavePositions();
  }

  private queueSavePositions(): void {
    if (!this.cy) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.savePositionsNow(), 250);
  }

  private queueSaveViewport(): void {
    if (!this.cy || this.applyingCamera) return;
    if (this.viewportSaveTimer) clearTimeout(this.viewportSaveTimer);
    this.viewportSaveTimer = setTimeout(() => this.saveViewportNow(), 400);
  }

  private currentViewport(): { zoom: number; x: number; y: number } | null {
    if (!this.cy) return null;
    const pan = this.cy.pan();
    return { zoom: this.cy.zoom(), x: pan.x, y: pan.y };
  }

  private saveViewportNow(): void {
    if (!this.cy || this.applyingCamera) return;
    const viewport = this.currentViewport();
    if (!viewport) return;
    const g = this.graph();
    if (g) this.graph.set({ ...g, viewport });
    this.api
      .saveAccountFlowGraphLayout({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode(),
        positions: [],
        viewport,
      })
      .subscribe({ error: () => undefined });
  }

  private savePositionsNow(): void {
    if (!this.cy) return;
    const positions: Array<{ nodeKey: string; x: number; y: number }> = [];
    const byId = new Map<string, { x: number; y: number }>();
    const synthetics: Record<string, { x: number; y: number }> = {
      ...(this.graph()?.syntheticLayout ?? {}),
    };
    this.cy.nodes().forEach((n) => {
      const id = n.id();
      if (n.hasClass('draft-node') || n.hasClass('amount-node')) return;
      const synthetic = id.startsWith('__saldo') || id.startsWith('__amt_');
      if (id.startsWith('__') && !synthetic) return;
      const p = n.position();
      const xy = { x: p.x, y: p.y };
      positions.push({ nodeKey: id, x: xy.x, y: xy.y });
      byId.set(id, xy);
      if (synthetic) synthetics[id] = xy;
    });
    if (!positions.length) return;

    const viewport = this.currentViewport();
    // Atualiza o estado local imediatamente — senão um re-render volta à posição antiga
    // e pode inclusive regravar o layout errado no servidor.
    const g = this.graph();
    if (g) {
      this.graph.set({
        ...g,
        syntheticLayout: synthetics,
        viewport: viewport ?? g.viewport,
        nodes: g.nodes.map((n) => {
          const p = byId.get(n.id);
          return p ? { ...n, x: p.x, y: p.y, positionSaved: true } : n;
        }),
      });
    }

    this.api
      .saveAccountFlowGraphLayout({
        year: this.year(),
        month: this.month() + 1,
        mode: this.mode(),
        positions,
        ...(viewport ? { viewport } : {}),
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
          scale: Math.max(scale, 0.35),
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

  onPortPointerDown(nodeId: string, ev: PointerEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.startLinkFrom(nodeId);
    this.beginArrowDrag(ev.clientX, ev.clientY);
  }

  // ── Toolbar / filtros ───────────────────────────────────────────────────

  fitView(): void {
    this.fitGraph();
    this.queueSaveViewport();
  }
  zoomIn(): void {
    this.zoom(1.3);
    this.queueSaveViewport();
  }
  zoomOut(): void {
    this.zoom(1 / 1.3);
    this.queueSaveViewport();
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
    const filters = {
      types: this.filterTypes(),
      accounts: this.filterAccounts(),
      categories: this.filterCategories(),
      tabs: this.filterTabs(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cy = this.cy as any;
    if (!filters.types.size && !filters.accounts.size && !filters.categories.size && !filters.tabs.size) {
      cy.elements().show();
      this.refreshOverlays();
      return;
    }
    const typeOf = (id: string) => cy.getElementById(id).data('type') || '';
    cy.edges().forEach((e: any) => {
      if (e.hasClass('balance-link') || e.hasClass('draft-edge')) return;
      const d = e.data();
      const edge = {
        from: d.origFrom || e.source().id(),
        to: d.origTo || e.target().id(),
        amountBrl: Number(d.amountBrl) || 0,
        kind: d.kind || 'expense',
        label: '',
        subKind: d.subKind || '',
        color: '',
        refId: Number(d.refId) || 0,
        itemCategoryId: d.itemCategoryId && d.itemCategoryId !== 'geral' ? Number(d.itemCategoryId) : null,
        customTabId: d.customTabId && d.customTabId !== 'geral' ? Number(d.customTabId) : null,
      } as AccountFlowGraphEdge;
      edgeVisibleForFilters(edge, filters, typeOf) ? e.show() : e.hide();
    });
    cy.nodes().forEach((n: any) => {
      if (n.hasClass('balance-node') || n.hasClass('amount-node') || n.hasClass('draft-node')) return;
      const flowEdges = n
        .connectedEdges()
        .filter((e: any) => !e.hasClass('balance-link') && !e.hasClass('draft-edge'))
        .map((e: any) => ({ hidden: e.hidden() }));
      nodeVisibleForFilters(n.id(), n.data('type') || '', flowEdges, filters) ? n.show() : n.hide();
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
