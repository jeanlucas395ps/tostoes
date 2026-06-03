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
} from '../../core/models/api.models';
import {
  CATEGORY_ICON_OPTIONS,
  categoryIcon,
  resolveItemIcon,
  suggestCategoryIcon,
} from '../../core/utils/category-icon.util';
import { responsibleLabel } from '../../core/utils/responsible.util';
import { isPastMonth } from '../../core/utils/month.util';
import {
  entryAmount,
  formatMoney,
  formatMoneyWithBrl,
  previewBrl,
} from '../../core/utils/money.util';

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
  fxPreview = signal<FxRateQuote | null>(null);
  loading = signal(true);
  busyId = signal<number | null>(null);
  showVariableModal = signal(false);
  editingPending = signal<MonthPlanEntry | null>(null);
  editingTx = signal<Transaction | null>(null);
  confirmEntry = signal<MonthPlanEntry | null>(null);
  accounts = signal<FinancialAccount[]>([]);
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
    newCategoryIcon: '📦',
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

  bankAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'bank')
  );

  investmentAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'investment')
  );
  formatMoney = formatMoney;
  formatMoneyWithBrl = formatMoneyWithBrl;

  variableModalTitle = computed(() => {
    if (this.editingTx()) return 'Editar variável';
    if (this.editingPending()) return 'Editar variável';
    return 'Novo variável';
  });

  formPreviewBrl = computed(() => {
    const rate = this.fxPreview()?.eurToBrl ?? this.eurToBrl();
    return previewBrl(this.variableForm.amount, this.variableForm.currency, rate);
  });

  showProjected = computed(() => !isPastMonth(this.year(), this.month()));

  sortedPending = computed(() => {
    const pending = this.ledger()?.pending ?? [];
    return [...pending].sort((a, b) => {
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
    return [...confirmed].sort((a, b) => {
      const byDate = a.transactionDate.localeCompare(b.transactionDate);
      if (byDate !== 0) return byDate;
      return a.id - b.id;
    });
  });

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) =>
      this.eurToBrl.set(s.eurToBrlFallback ?? s.eurToBrl)
    );
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
    this.api.getLedger(this.year(), this.month() + 1, 'income,expense,investment').subscribe({
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
      newCategoryIcon: '📦',
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
    if (this.variableForm.currency !== 'EUR') {
      this.fxPreview.set(null);
      return;
    }
    const date = this.variableForm.transactionDate || this.defaultTxDate();
    this.api.getFxRate(date).subscribe({
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
      newCategoryIcon: '📦',
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
    this.variableForm = {
      kind: t.kind,
      name: t.description,
      amount: t.amount,
      currency: t.currency,
      category: catName,
      itemCategoryId: this.categoryIdFromName(catName) ?? this.defaultCategoryId(),
      customTabId: this.defaultTabId(),
      newCategoryName: '',
      newCategoryIcon: '📦',
      responsibleUserId: t.responsibleUserId ?? null,
      transactionDate: t.transactionDate,
      accountId: t.accountId ?? null,
      investmentTypeId: t.investmentTypeId ?? null,
      financialAccountId: null,
      bankAccountId: null,
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
    if (
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

    const taxonomy = this.taxonomyPayload();
    const tab = this.customTabs().find((t) => t.id === this.variableForm.customTabId);
    const region =
      tab?.name.toLowerCase().includes('brasil')
        ? 'BR'
        : tab?.name.toLowerCase().includes('portugal')
          ? 'PT'
          : 'geral';

    const tx = this.editingTx();
    if (tx) {
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
        },
        tx.id
      ).subscribe({
        next: () => {
          this.closeVariableModal();
          this.load();
        },
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
      ...taxonomy,
      region,
    }).subscribe({
      next: () => {
        this.closeVariableModal();
        this.resetVariableForm('expense');
        this.api.getPlanningTaxonomy().subscribe((t) => {
          this.customTabs.set(t.customTabs);
          this.itemCategories.set(t.itemCategories);
        });
        this.load();
      },
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

    const runConfirm = () => {
      this.busyId.set(e.id);
      this.api.confirmMonthPlanEntry(e.id, {
        amount: result.amount,
        currency: result.currency,
        accountId: result.accountId,
        targetAccountId: result.targetAccountId,
      }).subscribe({
        next: () => {
          this.busyId.set(null);
          this.confirmEntry.set(null);
          this.load();
        },
        error: () => {
          this.busyId.set(null);
          this.confirmEntry.set(null);
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

  skip(e: MonthPlanEntry): void {
    this.busyId.set(e.id);
    this.api.skipMonthPlanEntry(e.id).subscribe({
      next: () => { this.busyId.set(null); this.load(); },
      error: () => this.busyId.set(null),
    });
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

  txLabel(t: Transaction): string {
    let label = formatMoneyWithBrl(t.amount, t.currency, t.amountBrl);
    if (t.currency === 'EUR' && t.eurToBrl) {
      label += ` · €1=R$${t.eurToBrl.toFixed(4)}`;
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
