import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import {
  ConfirmAccountDialogComponent,
  ConfirmAccountResult,
} from '../../shared/components/confirm-account-dialog/confirm-account-dialog.component';
import {
  Currency,
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
import { CATEGORY_ICON_OPTIONS, resolveItemIcon, suggestCategoryIcon } from '../../core/utils/category-icon.util';
import { responsibleLabel } from '../../core/utils/responsible.util';
import { entryAmount, formatMoneyWithBrl, previewBrl, currencySymbol, isForeignCurrency } from '../../core/utils/money.util';

@Component({
  selector: 'app-movements',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyBrlPipe,
    MonthNavComponent,
    ConfirmAccountDialogComponent,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
  ],
  templateUrl: './movements.page.html',
  styleUrl: './movements.page.scss',
})
export class MovementsPage implements OnInit {
  private api = inject(FinanceApiService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  activeSegment = signal<'pending' | 'confirmed'>('pending');
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
  payBillPrompt = signal<CreditBill | null>(null);
  payBillBankId = signal<number | null>(null);
  investmentTypes = signal<InvestmentType[]>([]);
  newCategoryMode = signal(false);
  categoryIconOptions = CATEGORY_ICON_OPTIONS;
  entryIcon = (e: MonthPlanEntry) => resolveItemIcon(e.itemCategoryName ?? e.category, e.itemCategoryIcon, e.name);
  responsibleLabel = responsibleLabel;
  formatMoneyWithBrl = formatMoneyWithBrl;

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

  variableUsesTabs(): boolean {
    return this.variableForm.kind === 'expense' || this.variableForm.kind === 'income';
  }
  variableIsInvestment(): boolean {
    return this.variableForm.kind === 'investment';
  }
  variableIsTransfer(): boolean {
    return this.variableForm.kind === 'transfer';
  }

  bankAccounts = computed(() => this.accounts().filter((a) => a.type === 'bank'));
  investmentAccounts = computed(() => this.accounts().filter((a) => a.type === 'investment'));
  allAccounts = computed(() => this.accounts());

  variableModalTitle = computed(() => {
    if (this.editingTx() || this.editingPending()) return 'Editar variável';
    return 'Novo variável';
  });

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
    this.loadLedger();
  }

  loadLedger(refresher?: HTMLIonRefresherElement): void {
    this.loading.set(true);
    this.api.getLedger(this.year(), this.month() + 1, 'income,expense,investment,transfer').subscribe({
      next: (l) => {
        this.ledger.set(l);
        this.loading.set(false);
        refresher?.complete();
      },
      error: () => {
        this.loading.set(false);
        refresher?.complete();
      },
    });
  }

  onRefresh(ev: CustomEvent): void {
    this.loadLedger(ev.target as unknown as HTMLIonRefresherElement);
  }

  load(): void {
    this.loadLedger();
  }

  onYearChange(y: number): void {
    this.year.set(y);
    this.loadLedger();
  }

  onMonthChange(m: number): void {
    this.month.set(m);
    this.loadLedger();
  }

  isVariablePending(e: MonthPlanEntry): boolean {
    return !e.recurringItemId && !e.isGoal;
  }

  isVariableTx(t: Transaction): boolean {
    return t.isVariablePlan === true || t.category === 'Variável';
  }

  entryCategoryLabel(e: MonthPlanEntry): string {
    return e.itemCategoryName ?? e.category;
  }

  entryTagLabel(e: { kind: EntryKind; isGoal?: boolean; isInstallment?: boolean }): string {
    if (e.isGoal) return 'Meta';
    if (e.isInstallment) return 'Parcela';
    if (e.kind === 'transfer') return 'Transf.';
    if (e.kind === 'income') return 'Receb.';
    if (e.kind === 'investment') return 'Invest.';
    return 'Gasto';
  }

  entryTagClass(e: { kind: EntryKind; isGoal?: boolean; isInstallment?: boolean }): string {
    if (e.isGoal) return 'goal';
    if (e.isInstallment) return 'installment';
    return e.kind;
  }

  pendingLabel(e: MonthPlanEntry): string {
    return formatMoneyWithBrl(entryAmount(e), e.currency ?? 'BRL', e.suggestedAmountBrl);
  }

  txLabel(t: Transaction): string {
    let label = formatMoneyWithBrl(t.amount, t.currency, t.amountBrl);
    if (t.accountName) label += ` · ${t.accountName}`;
    return label;
  }

  transferMeta(t: Transaction): string | null {
    const source = t.transferSourceAccountName?.trim() || t.accountName?.trim() || null;
    const target = t.transferTargetAccountName?.trim() || null;
    if (source && target) return `${source} → ${target}`;
    if (target) return `→ ${target}`;
    return source ? `Saída: ${source}` : null;
  }

  private defaultTxDate(): string {
    const day = Math.min(new Date().getDate(), 28);
    const m = this.month() + 1;
    return `${this.year()}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  defaultTabId(): number | null {
    return this.customTabs()[0]?.id ?? null;
  }

  defaultCategoryId(): number | null {
    return this.itemCategories()[0]?.id ?? null;
  }

  categoryIdFromName(name: string): number | null {
    return this.itemCategories().find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;
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
    if (this.variableForm.currency !== 'EUR' && this.variableForm.currency !== 'USD') {
      this.fxPreview.set(null);
      return;
    }
    const date = this.variableForm.transactionDate || this.defaultTxDate();
    this.api.getFxRate(date, this.variableForm.currency).subscribe({
      next: (q) => this.fxPreview.set(q),
      error: () => this.fxPreview.set(null),
    });
  }

  formPreviewBrl(): number {
    const cur = this.variableForm.currency;
    const fx = this.fxPreview();
    const rate = cur === 'USD' ? (fx?.usdToBrl ?? this.usdToBrl()) : (fx?.eurToBrl ?? this.eurToBrl());
    return previewBrl(this.variableForm.amount, cur, rate);
  }

  openNewVariable(): void {
    this.editingPending.set(null);
    this.editingTx.set(null);
    this.newCategoryMode.set(false);
    this.resetVariableForm('expense');
    this.showVariableModal.set(true);
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

  onCategorySelect(value: number | '__new__' | null): void {
    if (value === '__new__') {
      this.newCategoryMode.set(true);
      this.variableForm.itemCategoryId = null;
      this.variableForm.newCategoryName = '';
      this.variableForm.newCategoryIcon = suggestCategoryIcon('');
      return;
    }
    this.newCategoryMode.set(false);
    this.variableForm.itemCategoryId = value;
    const cat = this.itemCategories().find((c) => c.id === value);
    if (cat) this.variableForm.category = cat.name;
  }

  onNewCategoryNameChange(name: string): void {
    this.variableForm.newCategoryName = name;
    if (this.newCategoryMode()) this.variableForm.newCategoryIcon = suggestCategoryIcon(name);
  }

  closeVariableModal(): void {
    this.showVariableModal.set(false);
    this.editingPending.set(null);
    this.editingTx.set(null);
    this.fxPreview.set(null);
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2200, position: 'bottom' });
    await t.present();
  }

  private taxonomyPayload() {
    return {
      category: this.variableForm.category,
      customTabId: this.variableUsesTabs() ? this.variableForm.customTabId : null,
      itemCategoryId: this.variableForm.itemCategoryId,
      newCategoryName: this.newCategoryMode() ? this.variableForm.newCategoryName?.trim() || undefined : undefined,
      newCategoryIcon: this.newCategoryMode() ? this.variableForm.newCategoryIcon : undefined,
    };
  }

  async saveVariable(): Promise<void> {
    if (!this.variableForm.name.trim()) return;
    if (
      !this.variableIsTransfer() &&
      !this.variableIsInvestment() &&
      !this.newCategoryMode() &&
      !this.variableForm.itemCategoryId
    ) {
      return;
    }
    if (this.variableIsInvestment() && !this.variableForm.investmentTypeId) {
      await this.toast('Selecione o tipo de investimento.');
      return;
    }

    const taxonomy = this.variableIsTransfer()
      ? { category: 'Transferência', region: 'geral' as const }
      : this.taxonomyPayload();
    const tab = this.customTabs().find((t) => t.id === this.variableForm.customTabId);
    const region = this.variableIsTransfer()
      ? 'geral'
      : tab?.name.toLowerCase().includes('brasil')
        ? 'BR'
        : tab?.name.toLowerCase().includes('portugal')
          ? 'PT'
          : 'geral';

    const tx = this.editingTx();
    if (tx) {
      if (!this.variableForm.accountId) {
        await this.toast('Selecione a conta deste lançamento.');
        return;
      }
      this.api
        .saveTransaction(
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
        )
        .subscribe(() => {
          this.closeVariableModal();
          this.load();
        });
      return;
    }

    const pending = this.editingPending();
    if (pending) {
      this.api
        .updateMonthPlanEntry(pending.id, {
          kind: this.variableForm.kind,
          name: this.variableForm.name.trim(),
          suggestedAmount: this.variableForm.amount,
          currency: this.variableForm.currency,
          responsibleUserId: this.variableForm.responsibleUserId,
          ...taxonomy,
          region,
        })
        .subscribe(() => {
          this.closeVariableModal();
          this.load();
        });
      return;
    }

    this.api
      .addMonthPlanEntry({
        year: this.year(),
        month: this.month() + 1,
        kind: this.variableForm.kind,
        name: this.variableForm.name.trim(),
        amount: this.variableForm.amount,
        currency: this.variableForm.currency,
        responsibleUserId: this.variableForm.responsibleUserId,
        investmentTypeId: this.variableForm.investmentTypeId,
        financialAccountId: this.variableForm.financialAccountId,
        sourceFinancialAccountId: this.variableIsTransfer() ? this.variableForm.bankAccountId : null,
        ...taxonomy,
        region,
      })
      .subscribe(() => {
        this.closeVariableModal();
        this.api.getPlanningTaxonomy().subscribe((t) => {
          this.customTabs.set(t.customTabs);
          this.itemCategories.set(t.itemCategories);
        });
        this.load();
      });
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
      this.api
        .confirmMonthPlanEntry(e.id, {
          amount: result.amount,
          currency: result.currency,
          amountOut: result.amount,
          currencyOut: result.currency,
          amountIn: result.amountIn,
          currencyIn: result.currencyIn,
          accountId: result.accountId,
          targetAccountId: result.targetAccountId,
        })
        .subscribe({
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
      const patch: { suggestedAmount: number; currency: Currency; kind?: EntryKind } = {
        suggestedAmount: result.amount,
        currency: result.currency,
      };
      if (!e.recurringItemId) patch.kind = result.kind;
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
        this.payBillBankId.set(r.items.find((a) => a.type === 'bank')?.id ?? null);
        this.payBillPrompt.set(bill);
      },
    });
  }

  cancelPayBill(): void {
    this.payBillPrompt.set(null);
  }

  async submitPayBill(): Promise<void> {
    const bill = this.payBillPrompt();
    const bankId = this.payBillBankId();
    if (!bill || !bankId || bill.remainingBrl <= 0) return;

    this.api
      .addMonthPlanEntry({
        year: this.year(),
        month: this.month() + 1,
        kind: 'transfer',
        name: `Pagamento fatura · ${bill.name}`,
        amount: bill.remainingBrl,
        currency: 'BRL',
        sourceFinancialAccountId: bankId,
        financialAccountId: bill.accountId,
        category: 'Transferência',
        region: 'geral',
      })
      .subscribe({
        next: (plan) => {
          const pools = [
            ...(plan.sections?.variable ?? []),
            ...(plan.sections?.today ?? []),
            ...(plan.sections?.upcoming ?? []),
            ...(plan.sections?.overdue ?? []),
          ];
          const entry = pools.find(
            (e) =>
              e.kind === 'transfer' &&
              e.status === 'pending' &&
              (e.name.includes(bill.name) || e.sourceFinancialAccountId === bankId)
          );
          this.payBillPrompt.set(null);
          if (!entry) {
            this.load();
            return;
          }
          this.api
            .confirmMonthPlanEntry(entry.id, {
              amount: bill.remainingBrl,
              currency: 'BRL',
              amountOut: bill.remainingBrl,
              currencyOut: 'BRL',
              amountIn: bill.remainingBrl,
              currencyIn: 'BRL',
              accountId: bankId,
              targetAccountId: bill.accountId,
            })
            .subscribe({ next: () => this.load(), error: () => this.load() });
        },
        error: async () => this.toast('Não foi possível registrar o pagamento da fatura.'),
      });
  }

  async cancelBillItem(it: CreditBillItem): Promise<void> {
    if (it.canCancel === false) return;
    const alert = await this.alertCtrl.create({
      header: 'Cancelar cobrança',
      message: `Cancelar «${it.name}» desta fatura?`,
      buttons: [
        { text: 'Voltar', role: 'cancel' },
        { text: 'Cancelar cobrança', role: 'destructive', handler: () => this.confirmCancelBill(it) },
      ],
    });
    await alert.present();
  }

  private confirmCancelBill(it: CreditBillItem): void {
    const pending = it.status === 'pending';
    const entryId = it.monthPlanEntryId ?? (pending ? it.id : null);
    this.busyId.set(entryId ?? it.id);
    const done = () => {
      this.busyId.set(null);
      this.load();
    };
    const fail = () => this.busyId.set(null);
    if (pending) {
      this.api.skipMonthPlanEntry(entryId ?? it.id).subscribe({ next: done, error: fail });
      return;
    }
    if (entryId) {
      this.api.unconfirmMonthPlanEntry(entryId).subscribe({ next: done, error: fail });
    }
  }

  skip(e: MonthPlanEntry): void {
    this.busyId.set(e.id);
    this.api.skipMonthPlanEntry(e.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.load();
      },
      error: () => this.busyId.set(null),
    });
  }

  async removePending(e: MonthPlanEntry): Promise<void> {
    if (!this.isVariablePending(e)) return;
    const alert = await this.alertCtrl.create({
      header: 'Remover lançamento',
      message: `Remover «${e.name}» deste mês?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => {
            this.busyId.set(e.id);
            this.api.deleteMonthPlanEntry(e.id).subscribe({
              next: () => {
                this.busyId.set(null);
                this.load();
              },
              error: () => this.busyId.set(null),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  async unconfirmConfirmed(t: Transaction): Promise<void> {
    if (!t.canUnconfirm && !t.monthPlanEntryId) return;
    const alert = await this.alertCtrl.create({
      header: 'Desfazer confirmação',
      message: `Desfazer confirmação de «${t.description}»? O valor sai do saldo da conta.`,
      buttons: [
        { text: 'Voltar', role: 'cancel' },
        {
          text: 'Desfazer',
          role: 'destructive',
          handler: () => {
            this.busyId.set(t.id);
            const done = () => {
              this.busyId.set(null);
              this.load();
            };
            if (t.monthPlanEntryId) {
              this.api.unconfirmMonthPlanEntry(t.monthPlanEntryId).subscribe({ next: done, error: () => this.busyId.set(null) });
            } else {
              this.api.unconfirmTransaction(t.id).subscribe({ next: done, error: () => this.busyId.set(null) });
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
