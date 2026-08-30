import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import {
  ConfirmAccountDialogComponent,
  ConfirmAccountResult,
} from '../../shared/components/confirm-account-dialog/confirm-account-dialog.component';
import {
  Currency,
  DashboardSummary,
  EntryKind,
  FinancialAccount,
  FxRateQuote,
  InvestmentType,
  LedgerView,
  MonthPlanEntry,
  PlanningCustomTab,
  PlanningItemCategory,
  Transaction,
  User,
  CreditBill,
  CreditBillItem,
} from '../../core/models/api.models';
import {
  CATEGORY_ICON_OPTIONS,
  categoryIcon,
  categoryLucideNodes,
  resolveItemIcon,
  suggestCategoryIcon,
} from '../../core/utils/category-icon.util';
import { LucideSvgComponent } from '../../shared/components/lucide-svg/lucide-svg.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import type { IconNode } from 'lucide';
import { responsibleLabel } from '../../core/utils/responsible.util';
import { isPastMonth } from '../../core/utils/month.util';
import {
  entryAmount,
  formatMoney,
  formatMoneyWithBrl,
  previewBrl,
  currencySymbol,
  isForeignCurrency,
} from '../../core/utils/money.util';
import {
  clampInstallmentCount,
  installmentEndMonth,
  shouldAskInstallmentPrompt,
} from '../../core/utils/installment.util';

@Component({
  selector: 'app-movements',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyBrlPipe,
    MonthNavComponent,
    DecimalPipe,
    SlicePipe,
    ConfirmAccountDialogComponent,
    RouterLink,
    LucideSvgComponent,
    SkeletonComponent,
  ],
  templateUrl: './movements.component.html',
  styleUrl: './movements.component.scss',
})
export class MovementsComponent implements OnInit {
  private api = inject(FinanceApiService);

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  dashboard = signal<DashboardSummary | null>(null);
  ledger = signal<LedgerView | null>(null);
  householdUsers = signal<User[]>([]);
  customTabs = signal<PlanningCustomTab[]>([]);
  itemCategories = signal<PlanningItemCategory[]>([]);
  eurToBrl = signal(6.2);
  usdToBrl = signal(5.0);
  currencySymbol = currencySymbol;
  isForeignCurrency = isForeignCurrency;
  fxPreview = signal<FxRateQuote | null>(null);
  loading = signal(true);
  busyId = signal<number | null>(null);
  showVariableModal = signal(false);
  editingPending = signal<MonthPlanEntry | null>(null);
  editingTx = signal<Transaction | null>(null);
  confirmEntry = signal<MonthPlanEntry | null>(null);
  accounts = signal<FinancialAccount[]>([]);
  installmentPrompt = signal<{
    entry: MonthPlanEntry;
    result: ConfirmAccountResult;
    account: FinancialAccount;
  } | null>(null);
  installmentCount = signal(2);
  payBillPrompt = signal<CreditBill | null>(null);
  payBillBankId = signal<number | null>(null);
  payBillAmount = signal(0);
  payBillDate = signal(new Date().toISOString().slice(0, 10));
  payBillSelectedIds = signal<Set<number>>(new Set());
  pendingFilter = signal('');
  confirmedFilter = signal('');
  cancelBillPrompt = signal<CreditBillItem | null>(null);
  investmentTypes = signal<InvestmentType[]>([]);
  newCategoryMode = signal(false);
  categoryIconOptions = CATEGORY_ICON_OPTIONS;

  editAmounts = signal<Record<number, number>>({});

  variableForm = {
    kind: 'expense' as EntryKind,
    name: '',
    amount: 0,
    currency: 'BRL' as Currency,
    category: 'Geral',
    itemCategoryId: null as number | null,
    customTabId: null as number | null,
    newCategoryName: '',
    newCategoryIcon: 'package',
    responsibleUserId: null as number | null,
    transactionDate: '',
    accountId: null as number | null,
    investmentTypeId: null as number | null,
    financialAccountId: null as number | null,
    bankAccountId: null as number | null,
  };

  responsibleLabel = responsibleLabel;

  variableUsesTabs(): boolean {
    const k = this.variableForm.kind;
    return k === 'expense' || k === 'income';
  }

  variableIsInvestment(): boolean {
    return this.variableForm.kind === 'investment';
  }

  variableIsTransfer(): boolean {
    return this.variableForm.kind === 'transfer' || this.editingTransferPair();
  }

  /** Edição de transferência/aporte confirmado (duas pernas). */
  editingTransferPair = computed(() => {
    const t = this.editingTx();
    if (!t) return false;
    return !!t.transferLinkedTxId || !!t.transferTargetAccountId || this.isPairedTx(t);
  });

  private isPairedTx(t: Transaction): boolean {
    const notes = t.notes ?? '';
    return (
      (t.kind === 'transfer' && notes.includes('Transferência →')) ||
      (t.kind === 'investment' && notes.includes('Aporte →'))
    );
  }

  variableModalTitle = computed(() => {
    if (this.editingTransferPair()) return 'Editar transferência';
    if (this.editingTx()) return 'Editar variável';
    if (this.editingPending()) return 'Editar variável';
    return 'Novo variável';
  });

  bankAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'bank')
  );

  paymentAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'bank' || a.type === 'credit')
  );

  investmentAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'investment')
  );
  formatMoney = formatMoney;
  formatMoneyWithBrl = formatMoneyWithBrl;

  accountTypeLabel(type: FinancialAccount['type']): string {
    if (type === 'investment') return 'Invest.';
    if (type === 'credit') return 'Cartão';
    return 'Banco';
  }

  formPreviewBrl = computed(() => {
    const cur = this.variableForm.currency;
    const fx = this.fxPreview();
    const rate =
      cur === 'USD'
        ? (fx?.usdToBrl ?? this.usdToBrl())
        : (fx?.eurToBrl ?? this.eurToBrl());
    return previewBrl(this.variableForm.amount, cur, rate);
  });

  showProjected = computed(() => !isPastMonth(this.year(), this.month()));

  sortedPending = computed(() => {
    const pending = this.ledger()?.pending ?? [];
    const q = this.pendingFilter().trim().toLowerCase();
    const filtered = q
      ? pending.filter((e) => this.matchesPendingFilter(e, q))
      : pending;
    return [...filtered].sort((a, b) => {
      const aVar = this.isVariablePending(a) ? 0 : 1;
      const bVar = this.isVariablePending(b) ? 0 : 1;
      if (aVar !== bVar) return aVar - bVar;
      const dayA = a.dueDay ?? 999;
      const dayB = b.dueDay ?? 999;
      if (dayA !== dayB) return dayA - dayB;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  });

  sortedConfirmed = computed(() => {
    const confirmed = this.ledger()?.confirmed ?? [];
    const q = this.confirmedFilter().trim().toLowerCase();
    const filtered = q
      ? confirmed.filter((t) => this.matchesConfirmedFilter(t, q))
      : confirmed;
    return [...filtered].sort((a, b) => {
      const byDate = a.transactionDate.localeCompare(b.transactionDate);
      if (byDate !== 0) return byDate;
      return a.id - b.id;
    });
  });

  private matchesPendingFilter(e: MonthPlanEntry, q: string): boolean {
    const hay = [
      e.name,
      e.kind,
      this.entryTagLabel(e),
      e.category,
      e.itemCategoryName,
      e.customTabName,
      e.sourceFinancialAccountName,
      e.financialAccountName,
      e.currency,
      String(e.dueDay ?? ''),
      String(entryAmount(e)),
      String(e.suggestedAmountBrl ?? ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }

  private matchesConfirmedFilter(t: Transaction, q: string): boolean {
    const hay = [
      t.description,
      t.kind,
      this.entryTagLabel(t),
      t.category,
      t.accountName,
      t.transferSourceAccountName,
      t.transferTargetAccountName,
      t.currency,
      t.transactionDate,
      String(t.amount),
      String(t.amountBrl),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }

  creditBills = computed(() => this.ledger()?.creditBills ?? []);

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) => {
      this.eurToBrl.set(s.eurToBrlFallback ?? s.eurToBrl);
      this.usdToBrl.set(s.usdToBrlFallback ?? s.usdToBrl ?? 5);
    });
    this.api.getAccounts().subscribe((r) => this.accounts.set(r.items));
    this.api.getInvestmentTypes().subscribe((r) => this.investmentTypes.set(r.items));
    this.api.getHouseholdUsers().subscribe((r) => this.householdUsers.set(r.items));
    this.api.getPlanningTaxonomy().subscribe((t) => {
      this.customTabs.set(t.customTabs);
      this.itemCategories.set(t.itemCategories);
    });
    this.loadDashboard();
    this.loadLedger();
  }

  loadDashboard(): void {
    this.api.getDashboard(this.year()).subscribe({
      next: (d) => this.dashboard.set(d),
      error: () => this.dashboard.set(null),
    });
  }

  loadLedger(): void {
    this.loading.set(true);
    this.api.getLedger(this.year(), this.month() + 1, 'income,expense,investment,leisure,transfer').subscribe({
      next: (l) => {
        this.ledger.set(l);
        const edits: Record<number, number> = {};
        for (const p of l.pending) edits[p.id] = entryAmount(p);
        this.editAmounts.set(edits);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  load(): void {
    this.loadLedger();
  }

  onYearChange(y: number): void {
    this.year.set(y);
    this.loadDashboard();
    this.loadLedger();
  }

  onMonthChange(m: number): void {
    this.month.set(m);
    this.loadLedger();
  }

  isVariablePending(e: MonthPlanEntry): boolean {
    return !e.recurringItemId && !e.isGoal;
  }

  goalColor(e: MonthPlanEntry): string {
    return e.financialGoalColor ?? '#00AB55';
  }

  isVariableTx(t: Transaction): boolean {
    return t.isVariablePlan === true || t.category === 'Variável';
  }

  categoryIconFor = categoryIcon;
  lucideFor = (icon: string | null | undefined): IconNode => categoryLucideNodes(icon);

  entryIcon(e: MonthPlanEntry): string {
    return resolveItemIcon(
      e.itemCategoryName ?? e.category,
      e.itemCategoryIcon,
      e.name
    );
  }

  entryCategoryLabel(e: MonthPlanEntry): string {
    return e.itemCategoryName ?? e.category;
  }

  defaultTabId(): number | null {
    const tabs = this.customTabs();
    return tabs.length ? tabs[0].id : null;
  }

  defaultCategoryId(): number | null {
    return this.itemCategories()[0]?.id ?? null;
  }

  categoryIdFromName(name: string): number | null {
    const cat = this.itemCategories().find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    return cat?.id ?? null;
  }

  resetVariableForm(kind: EntryKind = 'expense'): void {
    const catId = this.defaultCategoryId();
    const cat = this.itemCategories().find((c) => c.id === catId);
    this.variableForm = {
      kind,
      name: '',
      amount: 0,
      currency: 'BRL',
      category: cat?.name ?? 'Geral',
      itemCategoryId: catId,
      customTabId: this.variableUsesTabs() ? this.defaultTabId() : null,
      newCategoryName: '',
      newCategoryIcon: 'package',
      responsibleUserId: null,
      transactionDate: this.defaultTxDate(),
      accountId: null,
      investmentTypeId: null,
      financialAccountId: null,
      bankAccountId: null,
    };
    this.refreshFxPreview();
  }

  refreshFxPreview(): void {
    if (this.variableForm.currency !== 'EUR' && this.variableForm.currency !== 'USD') {
      this.fxPreview.set(null);
      return;
    }
    const date = this.variableForm.transactionDate || this.defaultTxDate();
    const cur = this.variableForm.currency === 'USD' ? 'USD' : 'EUR';
    this.api.getFxRate(date, cur).subscribe({
      next: (q) => this.fxPreview.set(q),
      error: () => this.fxPreview.set(null),
    });
  }

  onVariableDateOrCurrencyChange(): void {
    this.refreshFxPreview();
  }

  openNewVariable(): void {
    this.editingPending.set(null);
    this.editingTx.set(null);
    this.newCategoryMode.set(false);
    this.resetVariableForm('expense');
    this.showVariableModal.set(true);
    this.refreshFxPreview();
  }

  openEditPending(e: MonthPlanEntry): void {
    if (!this.isVariablePending(e)) return;
    this.editingPending.set(e);
    this.editingTx.set(null);
    this.newCategoryMode.set(false);
    this.variableForm = {
      kind: e.kind,
      name: e.name,
      amount: entryAmount(e),
      currency: e.currency ?? 'BRL',
      category: e.itemCategoryName ?? e.category,
      itemCategoryId: e.itemCategoryId ?? this.defaultCategoryId(),
      customTabId: e.customTabId ?? this.defaultTabId(),
      newCategoryName: '',
      newCategoryIcon: 'package',
      responsibleUserId: e.responsibleUserId ?? null,
      transactionDate: this.defaultTxDate(),
      accountId: null,
      investmentTypeId: e.investmentTypeId ?? null,
      financialAccountId: e.financialAccountId ?? null,
      bankAccountId: null,
    };
    this.showVariableModal.set(true);
    this.refreshFxPreview();
  }

  openEditConfirmed(t: Transaction): void {
    if (!this.isVariableTx(t)) return;
    this.editingTx.set(t);
    this.editingPending.set(null);
    this.newCategoryMode.set(false);
    const catName = t.category === 'Variável' ? 'Geral' : t.category;
    const isPair = this.isPairedTx(t) || !!t.transferTargetAccountId || !!t.transferLinkedTxId;
    const sourceId = t.transferSourceAccountId ?? t.accountId ?? null;
    const targetId = t.transferTargetAccountId ?? null;
    this.variableForm = {
      kind: isPair ? 'transfer' : t.kind,
      name: t.description,
      amount: t.transferOutAmount ?? t.amount,
      currency: t.transferOutCurrency ?? t.currency,
      category: isPair ? 'Transferência' : catName,
      itemCategoryId: isPair ? null : (this.categoryIdFromName(catName) ?? this.defaultCategoryId()),
      customTabId: this.defaultTabId(),
      newCategoryName: '',
      newCategoryIcon: 'package',
      responsibleUserId: t.responsibleUserId ?? null,
      transactionDate: t.transactionDate,
      accountId: sourceId,
      investmentTypeId: t.investmentTypeId ?? null,
      financialAccountId: targetId,
      bankAccountId: sourceId,
    };
    this.showVariableModal.set(true);
    this.refreshFxPreview();
  }

  onCategorySelect(value: string | number | null): void {
    if (value === '__new__') {
      this.newCategoryMode.set(true);
      this.variableForm.itemCategoryId = null;
      this.variableForm.newCategoryName = '';
      this.variableForm.newCategoryIcon = suggestCategoryIcon('');
      return;
    }
    this.newCategoryMode.set(false);
    const id = typeof value === 'number' ? value : value ? Number(value) : null;
    this.variableForm.itemCategoryId = Number.isFinite(id) ? id : null;
    const cat = this.itemCategories().find((c) => c.id === this.variableForm.itemCategoryId);
    if (cat) this.variableForm.category = cat.name;
  }

  onNewCategoryNameChange(name: string): void {
    this.variableForm.newCategoryName = name;
    if (this.newCategoryMode()) {
      this.variableForm.newCategoryIcon = suggestCategoryIcon(name);
    }
  }

  onVariableKindChange(): void {
    if (this.variableUsesTabs() && this.variableForm.customTabId == null) {
      this.variableForm.customTabId = this.defaultTabId();
    }
    if (this.variableForm.itemCategoryId == null) {
      this.variableForm.itemCategoryId = this.defaultCategoryId();
      const cat = this.itemCategories().find((c) => c.id === this.variableForm.itemCategoryId);
      if (cat) this.variableForm.category = cat.name;
    }
  }

  private taxonomyPayload(): {
    category?: string;
    customTabId?: number | null;
    itemCategoryId?: number | null;
    newCategoryName?: string;
    newCategoryIcon?: string;
    region?: string;
  } {
    return {
      category: this.variableForm.category,
      customTabId: this.variableUsesTabs() ? this.variableForm.customTabId : null,
      itemCategoryId: this.variableForm.itemCategoryId,
      newCategoryName: this.newCategoryMode()
        ? this.variableForm.newCategoryName?.trim() || undefined
        : undefined,
      newCategoryIcon: this.newCategoryMode()
        ? this.variableForm.newCategoryIcon
        : undefined,
    };
  }

  closeVariableModal(): void {
    this.showVariableModal.set(false);
    this.editingPending.set(null);
    this.editingTx.set(null);
    this.fxPreview.set(null);
  }

  saveVariable(): void {
    if (!this.variableForm.name.trim()) return;
    if (this.variableIsTransfer()) {
      // categoria não é obrigatória
      if (!this.variableForm.bankAccountId || !this.variableForm.financialAccountId) {
        alert('Selecione a conta de saída e a conta de entrada da transferência.');
        return;
      }
      if (this.variableForm.bankAccountId === this.variableForm.financialAccountId) {
        alert('Conta de saída e entrada devem ser diferentes.');
        return;
      }
    } else if (
      !this.variableIsInvestment() &&
      !this.newCategoryMode() &&
      !this.variableForm.itemCategoryId
    ) {
      return;
    }
    if (this.variableIsInvestment() && !this.variableForm.investmentTypeId) {
      alert('Selecione o tipo de investimento.');
      return;
    }

    const taxonomy = this.variableIsTransfer()
      ? { category: 'Transferência', region: 'geral' as const }
      : this.taxonomyPayload();
    const tab = this.customTabs().find((t) => t.id === this.variableForm.customTabId);
    const region =
      this.variableIsTransfer()
        ? 'geral'
        : tab?.name.toLowerCase().includes('brasil')
          ? 'BR'
          : tab?.name.toLowerCase().includes('portugal')
            ? 'PT'
            : 'geral';

    const tx = this.editingTx();
    if (tx) {
      const isPair = this.editingTransferPair();
      if (isPair) {
        if (!this.variableForm.bankAccountId || !this.variableForm.financialAccountId) {
          alert('Selecione a conta de saída e a conta de entrada da transferência.');
          return;
        }
        this.api
          .saveTransaction(
            {
              kind: tx.kind, // API preserva kind do par; enviado por compatibilidade
              description: this.variableForm.name.trim(),
              amount: this.variableForm.amount,
              currency: this.variableForm.currency,
              transactionDate: this.variableForm.transactionDate,
              category: tx.category || 'Transferência',
              region: tx.region ?? 'geral',
              responsibleUserId: this.variableForm.responsibleUserId,
              accountId: this.variableForm.bankAccountId,
              targetAccountId: this.variableForm.financialAccountId,
              amountIn: this.variableForm.amount,
              currencyIn: this.variableForm.currency,
              notes: tx.notes ?? undefined,
            } as Partial<Transaction> & {
              targetAccountId?: number;
              amountIn?: number;
              currencyIn?: Currency;
            },
            tx.id
          )
          .subscribe({
            next: () => {
              this.closeVariableModal();
              this.load();
            },
            error: (err) =>
              alert(err?.error?.error ?? 'Não foi possível salvar a transferência.'),
          });
        return;
      }

      if (!this.variableForm.accountId) {
        alert('Selecione a conta deste lançamento.');
        return;
      }
      this.api.saveTransaction(
        {
          kind: this.variableForm.kind,
          description: this.variableForm.name.trim(),
          amount: this.variableForm.amount,
          currency: this.variableForm.currency,
          transactionDate: this.variableForm.transactionDate,
          category: this.variableForm.category,
          region: tx.region ?? region,
          responsibleUserId: this.variableForm.responsibleUserId,
          accountId: this.variableForm.accountId,
          notes: tx.notes ?? undefined,
        },
        tx.id
      ).subscribe({
        next: () => {
          this.closeVariableModal();
          this.load();
        },
        error: (err) =>
          alert(err?.error?.error ?? 'Não foi possível salvar o lançamento.'),
      });
      return;
    }

    const pending = this.editingPending();
    if (pending) {
      this.api.updateMonthPlanEntry(pending.id, {
        kind: this.variableForm.kind,
        name: this.variableForm.name.trim(),
        suggestedAmount: this.variableForm.amount,
        currency: this.variableForm.currency,
        responsibleUserId: this.variableForm.responsibleUserId,
        ...taxonomy,
        region,
      }).subscribe({
        next: () => {
          this.closeVariableModal();
          this.load();
        },
      });
      return;
    }

    this.api.addMonthPlanEntry({
      year: this.year(),
      month: this.month() + 1,
      kind: this.variableForm.kind,
      name: this.variableForm.name.trim(),
      amount: this.variableForm.amount,
      currency: this.variableForm.currency,
      responsibleUserId: this.variableForm.responsibleUserId,
      investmentTypeId: this.variableForm.investmentTypeId,
      financialAccountId: this.variableForm.financialAccountId,
      sourceFinancialAccountId: this.variableIsTransfer()
        ? this.variableForm.bankAccountId
        : null,
      ...taxonomy,
      region,
    }).subscribe({
      next: (plan) => {
        const shouldAutoConfirm =
          this.variableIsTransfer() &&
          !!this.variableForm.bankAccountId &&
          !!this.variableForm.financialAccountId;

        const finish = () => {
          this.closeVariableModal();
          this.resetVariableForm('expense');
          this.api.getPlanningTaxonomy().subscribe((t) => {
            this.customTabs.set(t.customTabs);
            this.itemCategories.set(t.itemCategories);
          });
          this.load();
        };

        if (!shouldAutoConfirm) {
          finish();
          return;
        }

        const pools = [
          ...(plan.sections?.variable ?? []),
          ...(plan.sections?.today ?? []),
          ...(plan.sections?.upcoming ?? []),
          ...(plan.sections?.overdue ?? []),
          ...(plan.entries ?? []),
        ];
        const entry = pools.find(
          (e) =>
            e.kind === 'transfer' &&
            e.status === 'pending' &&
            e.sourceFinancialAccountId === this.variableForm.bankAccountId &&
            e.financialAccountId === this.variableForm.financialAccountId
        ) ?? pools.find((e) => e.kind === 'transfer' && e.status === 'pending');

        if (!entry) {
          finish();
          return;
        }

        this.api
          .confirmMonthPlanEntry(entry.id, {
            amount: this.variableForm.amount,
            currency: this.variableForm.currency,
            amountOut: this.variableForm.amount,
            currencyOut: this.variableForm.currency,
            amountIn: this.variableForm.amount,
            currencyIn: this.variableForm.currency,
            accountId: this.variableForm.bankAccountId!,
            targetAccountId: this.variableForm.financialAccountId!,
          })
          .subscribe({
            next: finish,
            error: (err) => {
              alert(err?.error?.error ?? 'Transferência criada, mas falhou ao confirmar. Confirme em A confirmar.');
              finish();
            },
          });
      },
      error: (err) =>
        alert(err?.error?.error ?? 'Não foi possível criar o lançamento.'),
    });
  }

  private defaultTxDate(): string {
    const day = Math.min(new Date().getDate(), 28);
    const m = this.month() + 1;
    return `${this.year()}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  amountFor(e: MonthPlanEntry): number {
    return this.editAmounts()[e.id] ?? entryAmount(e);
  }

  setAmount(e: MonthPlanEntry, v: number): void {
    this.editAmounts.update((m) => ({ ...m, [e.id]: v }));
  }

  saveAmount(e: MonthPlanEntry): void {
    const amount = this.amountFor(e);
    if (amount === entryAmount(e)) return;
    this.api.updateMonthPlanEntry(e.id, {
      suggestedAmount: amount,
      currency: e.currency ?? 'BRL',
    }).subscribe(() => this.load());
  }

  confirm(e: MonthPlanEntry): void {
    this.api.getAccounts().subscribe({
      next: (r) => {
        this.accounts.set(r.items);
        this.confirmEntry.set(e);
      },
      error: () => this.busyId.set(null),
    });
  }

  cancelConfirm(): void {
    this.confirmEntry.set(null);
    this.busyId.set(null);
  }

  submitConfirm(result: ConfirmAccountResult): void {
    const e = this.confirmEntry();
    if (!e) return;

    const account = this.accounts().find((a) => a.id === result.accountId);
    const askInstallment = shouldAskInstallmentPrompt({
      accountType: account?.type,
      kind: result.kind,
      isInstallment: e.isInstallment,
      isGoal: e.isGoal,
      recurringItemId: e.recurringItemId,
    });

    if (askInstallment && account) {
      this.installmentCount.set(2);
      this.installmentPrompt.set({ entry: e, result, account });
      return;
    }

    this.runConfirm(result);
  }

  cancelInstallmentPrompt(): void {
    this.installmentPrompt.set(null);
  }

  confirmWithoutInstallment(): void {
    const prompt = this.installmentPrompt();
    if (!prompt) return;
    this.installmentPrompt.set(null);
    this.runConfirm(prompt.result);
  }

  confirmWithInstallment(): void {
    const prompt = this.installmentPrompt();
    if (!prompt) return;
    const n = clampInstallmentCount(this.installmentCount());
    const e = prompt.entry;
    const result = prompt.result;
    const startMonth = `${this.year()}-${String(this.month() + 1).padStart(2, '0')}`;
    const endMonth = installmentEndMonth(this.year(), this.month(), n);

    this.api
      .saveRecurringItem({
        kind: 'expense',
        name: e.name,
        category: e.category,
        region: e.region,
        customTabId: e.customTabId ?? null,
        itemCategoryId: e.itemCategoryId ?? null,
        responsibleUserId: e.responsibleUserId ?? null,
        currency: result.currency,
        amount: result.amount,
        dueDay: e.dueDay ?? prompt.account.dueDay ?? 10,
        sourceFinancialAccountId: result.accountId,
        isInstallment: true,
        startDate: `${startMonth}-01`,
        endDate: `${endMonth}-01`,
      })
      .subscribe({
        next: () => {
          this.installmentPrompt.set(null);
          // Remove variável e confirma a parcela do mês via fluxo normal após reload
          if (this.isVariablePending(e)) {
            this.api.deleteMonthPlanEntry(e.id).subscribe({
              next: () => {
                this.confirmEntry.set(null);
                this.load();
              },
              error: () => {
                this.confirmEntry.set(null);
                this.load();
              },
            });
            return;
          }
          this.runConfirm(result);
        },
        error: () => {
          alert('Não foi possível criar a compra parcelada.');
        },
      });
  }

  private runConfirm(result: ConfirmAccountResult): void {
    const e = this.confirmEntry();
    if (!e) return;

    const runConfirm = () => {
      this.busyId.set(e.id);
      this.api.confirmMonthPlanEntry(e.id, {
        amount: result.amount,
        currency: result.currency,
        amountOut: result.amount,
        currencyOut: result.currency,
        amountIn: result.amountIn,
        currencyIn: result.currencyIn,
        accountId: result.accountId,
        targetAccountId: result.targetAccountId,
      }).subscribe({
        next: () => {
          this.busyId.set(null);
          this.confirmEntry.set(null);
          this.load();
        },
        error: (err) => {
          this.busyId.set(null);
          alert(err?.error?.error ?? 'Não foi possível confirmar o lançamento.');
        },
      });
    };

    const needsPatch =
      Math.abs(result.amount - entryAmount(e)) > 0.001 ||
      result.currency !== (e.currency ?? 'BRL') ||
      (!e.recurringItemId && !e.isGoal && result.kind !== e.kind);

    if (needsPatch) {
      const patch: {
        suggestedAmount: number;
        currency: Currency;
        kind?: EntryKind;
      } = {
        suggestedAmount: result.amount,
        currency: result.currency,
      };
      if (!e.recurringItemId) {
        patch.kind = result.kind;
      }
      this.api.updateMonthPlanEntry(e.id, patch).subscribe({
        next: runConfirm,
        error: () => this.cancelConfirm(),
      });
      return;
    }
    runConfirm();
  }

  openPayBill(bill: CreditBill): void {
    this.api.getAccounts().subscribe({
      next: (r) => {
        this.accounts.set(r.items);
        const banks = r.items.filter((a) => a.type === 'bank');
        this.payBillBankId.set(banks[0]?.id ?? null);
        this.payBillAmount.set(bill.remainingBrl > 0 ? bill.remainingBrl : bill.forecast.totalBrl);
        this.payBillDate.set(this.defaultTxDate());
        this.payBillSelectedIds.set(new Set());
        this.payBillPrompt.set(bill);
      },
    });
  }

  cancelPayBill(): void {
    this.payBillPrompt.set(null);
    this.payBillSelectedIds.set(new Set());
  }

  togglePayBillItem(id: number): void {
    const next = new Set(this.payBillSelectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.payBillSelectedIds.set(next);
    const bill = this.payBillPrompt();
    if (!bill || next.size === 0) return;
    const sum = bill.items
      .filter((it) => next.has(it.id) && it.status !== 'payment')
      .reduce((acc, it) => acc + it.amountBrl, 0);
    if (sum > 0) this.payBillAmount.set(Math.round(sum * 100) / 100);
  }

  isPayBillItemSelected(id: number): boolean {
    return this.payBillSelectedIds().has(id);
  }

  payBillSelectableItems(): CreditBillItem[] {
    return (this.payBillPrompt()?.items ?? []).filter((i) => i.status !== 'payment');
  }

  submitPayBill(): void {
    const bill = this.payBillPrompt();
    const bankId = this.payBillBankId();
    const amount = this.payBillAmount();
    if (!bill || !bankId || amount <= 0) return;

    const selected = bill.items.filter(
      (it) => this.payBillSelectedIds().has(it.id) && it.status !== 'payment'
    );
    const itemNames = selected.map((it) => it.name);

    this.api
      .advanceAccountPayment(bill.accountId, {
        sourceAccountId: bankId,
        amount,
        currency: 'BRL',
        transactionDate: this.payBillDate(),
        description: `Pagamento fatura, ${bill.name}`,
        itemNames: itemNames.length ? itemNames : undefined,
      })
      .subscribe({
        next: () => {
          this.payBillPrompt.set(null);
          this.payBillSelectedIds.set(new Set());
          this.load();
        },
        error: (err) =>
          alert(err?.error?.error ?? 'Não foi possível registrar o pagamento da fatura.'),
      });
  }

  skip(e: MonthPlanEntry): void {
    this.busyId.set(e.id);
    this.api.skipMonthPlanEntry(e.id).subscribe({
      next: () => { this.busyId.set(null); this.load(); },
      error: () => this.busyId.set(null),
    });
  }

  /** Abre pop de confirmação para cancelar cobrança da fatura. */
  cancelBillItem(it: CreditBillItem): void {
    if (it.canCancel === false) return;
    this.cancelBillPrompt.set(it);
  }

  closeCancelBill(): void {
    this.cancelBillPrompt.set(null);
  }

  confirmCancelBill(): void {
    const it = this.cancelBillPrompt();
    if (!it) return;

    const pending = it.status === 'pending';
    const entryId = it.monthPlanEntryId ?? (pending ? it.id : null);
    this.busyId.set(entryId ?? it.id);
    const done = () => {
      this.busyId.set(null);
      this.cancelBillPrompt.set(null);
      this.load();
    };
    const fail = () => this.busyId.set(null);

    if (pending) {
      this.api.skipMonthPlanEntry(entryId ?? it.id).subscribe({ next: done, error: fail });
      return;
    }
    if (entryId) {
      this.api.unconfirmMonthPlanEntry(entryId).subscribe({ next: done, error: fail });
      return;
    }
    this.busyId.set(null);
    this.cancelBillPrompt.set(null);
  }

  /** Remove variável pendente do mês (coluna esquerda). */
  removePending(e: MonthPlanEntry): void {
    if (!this.isVariablePending(e)) return;
    if (!confirm(`Remover «${e.name}» deste mês?`)) return;
    this.busyId.set(e.id);
    this.api.deleteMonthPlanEntry(e.id).subscribe({
      next: () => { this.busyId.set(null); this.load(); },
      error: () => this.busyId.set(null),
    });
  }

  /** Volta confirmado para pendente e remove transações (restaura saldo das contas). */
  unconfirmConfirmed(t: Transaction): void {
    if (!t.canUnconfirm && !t.monthPlanEntryId) return;
    if (!confirm(`Desfazer confirmação de «${t.description}»? O valor sai do saldo da conta.`)) {
      return;
    }
    this.busyId.set(t.id);
    const done = () => { this.busyId.set(null); this.load(); };
    if (t.monthPlanEntryId) {
      this.api.unconfirmMonthPlanEntry(t.monthPlanEntryId).subscribe({
        next: done,
        error: () => this.busyId.set(null),
      });
    } else {
      this.api.unconfirmTransaction(t.id).subscribe({
        next: done,
        error: () => this.busyId.set(null),
      });
    }
  }

  isIncome(t: Transaction): boolean {
    return t.kind === 'income';
  }

  isTransfer(t: Transaction): boolean {
    return t.kind === 'transfer' || !!t.transferPairMode || this.isPairedTx(t);
  }

  isExpense(t: Transaction): boolean {
    return t.kind === 'expense' || t.kind === 'leisure';
  }

  entryTagLabel(e: {
    kind: EntryKind;
    isGoal?: boolean;
    isInstallment?: boolean;
    notes?: string | null;
    transferPairMode?: string | null;
  }): string {
    if (e.isGoal) return '◇ Meta';
    if (e.isInstallment) return '▦ Parcel.';
    if (
      e.kind === 'transfer' ||
      e.transferPairMode === 'aporte' ||
      e.transferPairMode === 'transfer' ||
      (e.kind === 'investment' && (e.notes ?? '').includes('Aporte →'))
    ) {
      return '⇄ Transf.';
    }
    if (e.kind === 'income') return '↑ Receb.';
    if (e.kind === 'investment') return '◆ Invest.';
    return '↓ Gasto';
  }

  entryTagClass(e: {
    kind: EntryKind;
    isGoal?: boolean;
    isInstallment?: boolean;
    notes?: string | null;
    transferPairMode?: string | null;
  }): string {
    if (e.isGoal) return 'goal';
    if (e.isInstallment) return 'installment';
    if (
      e.kind === 'transfer' ||
      !!e.transferPairMode ||
      (e.kind === 'investment' && (e.notes ?? '').includes('Aporte →'))
    ) {
      return 'transfer';
    }
    if (e.kind === 'income') return 'income';
    if (e.kind === 'investment') return 'investment';
    return 'expense';
  }

  /** Conta origem → destino. */
  transferMeta(t: Transaction): string | null {
    const source =
      t.transferSourceAccountName?.trim() || t.accountName?.trim() || null;
    const target = t.transferTargetAccountName?.trim() || null;
    if (source && target) return `${source} → ${target}`;
    if (target) return `→ ${target}`;
    if (source) return `Saída: ${source}`;
    const notes = (t.notes ?? '').trim();
    const out = notes.match(/^Transferência → (.+?)(?:\s*\(#\d+\))?$/);
    if (out) {
      const fromNotes = out[1].trim();
      return source ? `${source} → ${fromNotes}` : `→ ${fromNotes}`;
    }
    return null;
  }

  transferOutLabel(t: Transaction): string {
    const amount = t.transferOutAmount ?? t.amount;
    const currency = t.transferOutCurrency ?? t.currency;
    const brl = t.transferOutAmountBrl ?? t.amountBrl;
    return formatMoneyWithBrl(amount, currency, brl);
  }

  transferInLabel(t: Transaction): string {
    if (t.transferInAmount == null) {
      return ', ';
    }
    return formatMoneyWithBrl(
      t.transferInAmount,
      t.transferInCurrency ?? 'BRL',
      t.transferInAmountBrl ?? t.transferInAmount
    );
  }

  txLabel(t: Transaction): string {
    let label = formatMoneyWithBrl(t.amount, t.currency, t.amountBrl);
    if (t.currency === 'EUR' && t.eurToBrl) {
      label += ` · €1=R$${t.eurToBrl.toFixed(4)}`;
    }
    if (t.currency === 'USD' && t.usdToBrl) {
      label += ` · US$1=R$${t.usdToBrl.toFixed(4)}`;
    }
    if (t.accountName) {
      label += ` · ${t.accountName}`;
    }
    return label;
  }

  pendingLabel(e: MonthPlanEntry): string {
    return formatMoneyWithBrl(
      entryAmount(e),
      e.currency ?? 'BRL',
      e.suggestedAmountBrl
    );
  }
}
