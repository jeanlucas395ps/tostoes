import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MovementsComponent } from './movements.component';
import { environment } from '../../../environments/environment';
import {
  FinancialAccount,
  LedgerView,
  MonthPlan,
  MonthPlanEntry,
  Transaction,
} from '../../core/models/api.models';
import { ConfirmAccountResult } from '../../shared/components/confirm-account-dialog/confirm-account-dialog.component';

describe('MovementsComponent (class coverage)', () => {
  let fixture: ComponentFixture<MovementsComponent>;
  let component: MovementsComponent;
  let http: HttpTestingController;
  let alertSpy: jasmine.Spy;
  let confirmSpy: jasmine.Spy;
  const base = environment.apiUrl;

  function pending(over: Partial<MonthPlanEntry> = {}): MonthPlanEntry {
    return {
      id: 1,
      kind: 'expense',
      name: 'Mercado',
      category: 'Casa',
      region: 'geral',
      suggestedAmount: 40,
      suggestedAmountBrl: 40,
      status: 'pending',
      ...over,
    };
  }

  function tx(over: Partial<Transaction> = {}): Transaction {
    return {
      id: 8,
      transactionDate: '2026-10-02',
      kind: 'expense',
      description: 'Café',
      amount: 10,
      currency: 'BRL',
      amountBrl: 10,
      category: 'Variável',
      region: 'geral',
      isVariablePlan: true,
      ...over,
    };
  }

  function emptyLedger(extra: Partial<LedgerView> = {}): LedgerView {
    return {
      year: 2026,
      month: 10,
      pending: [],
      confirmed: [],
      creditBills: [],
      summary: {
        incomeTotal: 0,
        expenseTotal: 0,
        balance: 0,
        pendingCount: 0,
        confirmedCount: 0,
        projected: { income: 0, expense: 0, balance: 0 },
      },
      ...extra,
    };
  }

  function plan(entries: MonthPlanEntry[] = []): MonthPlan {
    return {
      year: 2026,
      month: 10,
      sections: {
        today: [],
        overdue: [],
        upcoming: [],
        variable: entries,
        completed: [],
      },
      entries,
      forecast: [],
      summary: {
        projected: { income: 0, expense: 0, investment: 0, leisure: 0, transfer: 0 },
        confirmed: { income: 0, expense: 0, investment: 0, leisure: 0, transfer: 0 },
        pendingCount: 0,
        pendingFixedCount: 0,
        pendingVariableCount: 0,
        confirmedCount: 0,
        skippedCount: 0,
        totalEntries: entries.length,
        forecastCount: 0,
        progressPercent: 0,
        balanceProjected: 0,
        balanceConfirmed: 0,
        balanceAfterLeisure: 0,
      },
      insights: { topExpenseCategories: [], message: '' },
    };
  }

  function flushBoot(): void {
    http.expectOne(`${base}/settings`).flush({ eurToBrl: 6.1, usdToBrl: 5.2 });
    http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [] });
    http.expectOne(`${base}/investment-types`).flush({ items: [] });
    http.expectOne(`${base}/auth/users`).flush({ items: [] });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({});
    http.expectOne((r) => r.url === `${base}/ledger`).flush(emptyLedger());
  }

  function flushLedger(): void {
    http.expectOne((r) => r.url === `${base}/ledger`).flush(emptyLedger());
  }

  function account(over: Partial<FinancialAccount>): FinancialAccount {
    return {
      id: 1,
      name: 'Banco',
      type: 'bank',
      currency: 'BRL',
      initialBalance: 0,
      initialBalanceDate: '2026-01-01',
      sortOrder: 0,
      balance: 100,
      balanceBrl: 100,
      ...over,
    } as FinancialAccount;
  }

  beforeEach(() => {
    alertSpy = spyOn(window, 'alert');
    confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    TestBed.configureTestingModule({
      imports: [MovementsComponent, HttpClientTestingModule],
    })
      .overrideComponent(MovementsComponent, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(MovementsComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushBoot();
  });

  afterEach(() => http.verify());

  it('classifies accounts, tags, filters and transfer labels', () => {
    component.accounts.set([
      account({ id: 1, type: 'bank', name: 'Nubank' }),
      account({ id: 2, type: 'credit', name: 'Visa' }),
      account({ id: 3, type: 'investment', name: 'Tesouro' }),
    ]);
    expect(component.bankAccounts().map((a) => a.id)).toEqual([1]);
    expect(component.paymentAccounts().map((a) => a.id)).toEqual([1, 2, 3]);
    expect(component.incomeAccounts().map((a) => a.id)).toEqual([1, 3]);
    expect(component.investmentAccounts().map((a) => a.id)).toEqual([3]);
    expect(component.accountTypeLabel('investment')).toBe('Invest.');
    expect(component.accountTypeLabel('credit')).toBe('Cartão');
    expect(component.accountTypeLabel('bank')).toBe('Banco');

    const variable = pending({ id: 1, name: 'Zap', dueDay: null, kind: 'expense' });
    const fixed = pending({
      id: 2,
      name: 'Aluguel',
      dueDay: 5,
      recurringItemId: 9,
      isGoal: false,
      kind: 'income',
      itemCategoryName: 'Moradia',
      customTabName: 'Brasil',
      sourceFinancialAccountName: 'Nubank',
      financialAccountName: 'Casa',
      currency: 'EUR',
      suggestedAmountBrl: 80,
    });
    const goal = pending({ id: 3, name: 'Viagem', dueDay: 20, isGoal: true, financialGoalColor: '#abc' });
    component.ledger.set(
      emptyLedger({
        pending: [fixed, goal, variable],
        confirmed: [
          tx({ id: 2, transactionDate: '2026-10-03', description: 'Tarde', kind: 'income' }),
          tx({
            id: 1,
            transactionDate: '2026-10-03',
            description: 'Cedo',
            kind: 'transfer',
            notes: 'Transferência → Itaú',
            transferSourceAccountName: 'Nubank',
            transferTargetAccountName: 'Itaú',
            accountName: 'Nubank',
            transferOutAmount: 50,
            transferOutCurrency: 'EUR',
            transferOutAmountBrl: 300,
            transferInAmount: 50,
            transferInCurrency: 'EUR',
            transferInAmountBrl: 300,
            currency: 'EUR',
            eurToBrl: 6.1,
            amount: 50,
            amountBrl: 300,
          }),
          tx({
            id: 4,
            transactionDate: '2026-10-01',
            description: 'Dólar',
            currency: 'USD',
            usdToBrl: 5.4,
            accountName: 'Wise',
            kind: 'investment',
            notes: 'Aporte → Tesouro',
            category: 'Investimento',
            isVariablePlan: false,
          }),
        ],
      })
    );
    component.pendingFilter.set('zap');
    expect(component.sortedPending().map((e) => e.id)).toEqual([1]);
    component.pendingFilter.set('   ');
    expect(component.sortedPending().map((e) => e.id)).toEqual([1, 2, 3]);
    component.confirmedFilter.set('cedo');
    expect(component.sortedConfirmed().map((t) => t.id)).toEqual([1]);
    component.confirmedFilter.set('');
    expect(component.sortedConfirmed().map((t) => t.id)).toEqual([4, 1, 2]);

    expect(component.isVariablePending(variable)).toBeTrue();
    expect(component.isVariablePending(fixed)).toBeFalse();
    expect(component.goalColor(goal)).toBe('#abc');
    expect(component.goalColor(variable)).toBe('#00AB55');
    expect(component.isVariableTx(tx())).toBeTrue();
    expect(component.isVariableTx(tx({ isVariablePlan: false, category: 'Casa' }))).toBeFalse();
    expect(component.entryCategoryLabel(fixed)).toBe('Moradia');
    expect(component.entryIcon(variable)).toBeTruthy();
    expect(component.isIncome(tx({ kind: 'income' }))).toBeTrue();
    expect(component.isExpense(tx({ kind: 'leisure' }))).toBeTrue();
    expect(component.isTransfer(tx({ kind: 'transfer' }))).toBeTrue();
    expect(component.isTransfer(tx({ kind: 'investment', notes: 'Aporte → X' }))).toBeTrue();

    expect(component.entryTagLabel({ kind: 'expense', isGoal: true })).toBe('Meta');
    expect(component.entryTagLabel({ kind: 'expense', isInstallment: true })).toBe('Parcel.');
    expect(component.entryTagLabel({ kind: 'transfer' })).toBe('Transf.');
    expect(component.entryTagLabel({ kind: 'investment', transferPairMode: 'aporte' })).toBe('Transf.');
    expect(component.entryTagLabel({ kind: 'income' })).toBe('Receb.');
    expect(component.entryTagLabel({ kind: 'investment' })).toBe('Invest.');
    expect(component.entryTagLabel({ kind: 'leisure' })).toBe('Gasto');
    expect(component.entryTagClass({ kind: 'expense', isGoal: true })).toBe('goal');
    expect(component.entryTagClass({ kind: 'expense', isInstallment: true })).toBe('installment');
    expect(component.entryTagClass({ kind: 'investment', notes: 'Aporte → Y' })).toBe('transfer');
    expect(component.entryTagClass({ kind: 'income' })).toBe('income');
    expect(component.entryTagClass({ kind: 'investment' })).toBe('investment');
    expect(component.entryTagClass({ kind: 'expense' })).toBe('expense');

    const paired = component.sortedConfirmed()[1];
    expect(component.transferMeta(paired)).toContain('Nubank');
    expect(component.transferMeta(tx({ transferTargetAccountName: 'Itaú' }))).toBe('→ Itaú');
    expect(component.transferMeta(tx({ accountName: 'Nubank' }))).toBe('Saída: Nubank');
    expect(component.transferMeta(tx({ notes: 'Transferência → Inter (#12)' }))).toBe('→ Inter');
    expect(component.transferMeta(tx({ notes: 'Transferência → Inter' }))).toBe('→ Inter');
    expect(component.transferMeta(tx({ notes: 'outro' }))).toBeNull();
    expect(component.transferOutLabel(paired)).toContain('R$');
    expect(component.transferInLabel(paired)).toContain('R$');
    expect(component.transferInLabel(tx())).toBe(', ');
    expect(component.txLabel(component.sortedConfirmed()[0])).toContain('Wise');
    expect(component.txLabel(paired)).toContain('€1=');
    expect(component.pendingLabel(fixed)).toContain('R$');
    expect(component.creditBills()).toEqual([]);
    expect(component.showProjected()).toBeTrue();
    component.year.set(2020);
    expect(component.showProjected()).toBeFalse();
    expect(component.lucideFor('cart')).toBeTruthy();
  });

  it('reloads on navigation and tolerates dashboard and ledger errors', () => {
    component.loadDashboard();
    http
      .expectOne((r) => r.url === `${base}/dashboard/summary`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.dashboard()).toBeNull();

    component.loadLedger();
    http
      .expectOne((r) => r.url === `${base}/ledger`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.loading()).toBeFalse();

    component.onYearChange(2025);
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({ year: 2025 });
    http.expectOne((r) => r.url === `${base}/ledger`).flush(emptyLedger({ pending: [pending()] }));
    expect(component.year()).toBe(2025);
    expect(component.editAmounts()[1]).toBe(40);

    component.onMonthChange(0);
    flushLedger();
    expect(component.month()).toBe(0);

    component.ngOnInit();
    http.expectOne(`${base}/settings`).flush({ eurToBrl: 6.4, usdToBrl: 5 });
    http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [] });
    http.expectOne(`${base}/investment-types`).flush({ items: [] });
    http.expectOne(`${base}/auth/users`).flush({ items: [] });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({});
    flushLedger();
    expect(component.eurToBrl()).toBe(6.4);
  });

  it('edits the variable form, fx preview and category branches', () => {
    component.customTabs.set([
      { id: 1, name: 'Brasil', sortOrder: 1 },
      { id: 2, name: 'Portugal', sortOrder: 2 },
    ]);
    component.itemCategories.set([
      { id: 10, name: 'Mercado', icon: 'cart', sortOrder: 1 },
      { id: 11, name: 'Geral', icon: 'box', sortOrder: 2 },
    ]);
    expect(component.defaultTabId()).toBe(1);
    expect(component.defaultCategoryId()).toBe(10);
    expect(component.categoryIdFromName('mercado')).toBe(10);
    expect(component.categoryIdFromName('nada')).toBeNull();

    component.openNewVariable();
    expect(component.showVariableModal()).toBeTrue();
    expect(component.variableModalTitle()).toBe('Novo variável');
    expect(component.variableForm.itemCategoryId as number | null).toBe(10);
    expect(component.variableUsesTabs()).toBeTrue();

    component.variableForm.amount = 2;
    component.variableForm.currency = 'EUR';
    component.onVariableDateOrCurrencyChange();
    http.expectOne((r) => r.url === `${base}/fx/eur-brl`).flush({ eurToBrl: 6.3, usdToBrl: 5 });
    expect(component.formPreviewBrl()).toBeGreaterThan(0);
    component.variableForm.currency = 'USD';
    component.variableForm.amount = 2;
    component.refreshFxPreview();
    http
      .expectOne((r) => r.url === `${base}/fx/usd-brl`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.fxPreview()).toBeNull();
    component.fxPreview.set({
      eurToBrl: 6,
      usdToBrl: 5.5,
      date: '2026-10-28',
      source: 'api',
      fallback: false,
    });
    expect(component.formPreviewBrl()).toBeGreaterThan(0);
    component.variableForm.currency = 'BRL';
    component.refreshFxPreview();
    expect(component.fxPreview()).toBeNull();

    component.onCategorySelect('__new__');
    expect(component.newCategoryMode()).toBeTrue();
    component.onNewCategoryNameChange('Padaria');
    expect(component.variableForm.newCategoryIcon).toBeTruthy();
    component.onCategorySelect(10);
    expect(component.variableForm.category).toBe('Mercado');
    component.onCategorySelect('11');
    expect(component.variableForm.itemCategoryId).toBe(11);
    component.onCategorySelect(null);
    expect(component.variableForm.itemCategoryId).toBeNull();
    component.onNewCategoryNameChange('x');
    expect(component.newCategoryMode()).toBeFalse();

    component.variableForm.kind = 'investment';
    component.variableForm.customTabId = null;
    component.variableForm.itemCategoryId = null;
    component.onVariableKindChange();
    expect(component.variableIsInvestment()).toBeTrue();
    expect(component.variableForm.itemCategoryId as number | null).toBe(10);
    component.resetVariableForm('income');
    expect(component.variableForm.kind).toBe('income');

    component.openEditPending(pending({ recurringItemId: 3 }));
    expect(component.editingPending()).toBeNull();
    component.openEditPending(
      pending({
        kind: 'income',
        currency: 'EUR',
        itemCategoryId: 11,
        customTabId: 2,
        responsibleUserId: 4,
        investmentTypeId: 1,
        financialAccountId: 3,
      })
    );
    http.expectOne((r) => r.url.includes('/fx/')).flush({ eurToBrl: 6 });
    expect(component.variableModalTitle()).toBe('Editar variável');
    expect(component.editingPending()?.id).toBe(1);

    component.openEditConfirmed(tx({ isVariablePlan: false, category: 'Fixa' }));
    expect(component.editingTx()).toBeNull();
    component.openEditConfirmed(
      tx({
        kind: 'transfer',
        notes: 'Transferência → Itaú',
        transferTargetAccountId: 9,
        transferSourceAccountId: 1,
        transferLinkedTxId: 2,
        transferOutAmount: 15,
        transferOutCurrency: 'BRL',
        category: 'Transferência',
      })
    );
    expect(component.editingTransferPair()).toBeTrue();
    expect(component.variableModalTitle()).toBe('Editar transferência');
    expect(component.variableIsTransfer()).toBeTrue();
    component.openEditConfirmed(tx({ category: 'Variável', kind: 'expense', accountId: 1 }));
    expect(component.variableForm.category).toBe('Geral');
    component.closeVariableModal();
    expect(component.showVariableModal()).toBeFalse();
  });

  it('saves variable expense, pending edit, confirmed edit and transfer pair', () => {
    component.customTabs.set([{ id: 2, name: 'Portugal norte', sortOrder: 1 }]);
    component.itemCategories.set([{ id: 10, name: 'Mercado', icon: 'cart', sortOrder: 1 }]);
    component.variableForm.kind = 'expense';
    component.variableForm.name = 'Pão';
    component.variableForm.amount = 12;
    component.variableForm.itemCategoryId = 10;
    component.variableForm.customTabId = 2;
    component.newCategoryMode.set(true);
    component.variableForm.newCategoryName = ' Padaria ';
    component.variableForm.newCategoryIcon = 'bread';
    component.saveVariable();
    http.expectOne((r) => r.method === 'POST' && r.url === `${base}/month-plan`).flush(plan());
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    flushLedger();
    expect(component.showVariableModal()).toBeFalse();

    component.variableForm.name = '   ';
    component.saveVariable();
    http.expectNone((r) => r.url === `${base}/month-plan`);

    component.variableForm.name = 'Sem categoria';
    component.variableForm.kind = 'expense';
    component.variableForm.itemCategoryId = null;
    component.newCategoryMode.set(false);
    component.saveVariable();
    http.expectNone((r) => r.url === `${base}/month-plan`);

    component.variableForm.kind = 'investment';
    component.variableForm.name = 'Aporte';
    component.variableForm.investmentTypeId = null;
    component.saveVariable();
    expect(alertSpy).toHaveBeenCalled();

    component.variableForm.kind = 'transfer';
    component.variableForm.bankAccountId = null;
    component.variableForm.financialAccountId = null;
    component.saveVariable();
    expect(String(alertSpy.calls.mostRecent().args[0])).toContain('saída');
    component.variableForm.bankAccountId = 1;
    component.variableForm.financialAccountId = 1;
    component.saveVariable();
    expect(String(alertSpy.calls.mostRecent().args[0])).toContain('diferentes');

    component.editingPending.set(pending({ id: 15 }));
    component.variableForm.kind = 'expense';
    component.variableForm.name = 'Editado';
    component.variableForm.itemCategoryId = 10;
    component.variableForm.customTabId = 1;
    component.customTabs.set([{ id: 1, name: 'Brasil', sortOrder: 1 }]);
    component.saveVariable();
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/month-plan/15`);
    expect(put.request.body.region).toBe('BR');
    put.flush(plan());
    flushLedger();

    component.editingTx.set(tx({ id: 20, region: 'PT' }));
    component.variableForm.kind = 'expense';
    component.variableForm.name = 'Confirmado';
    component.variableForm.accountId = null;
    component.variableForm.itemCategoryId = 10;
    component.saveVariable();
    expect(String(alertSpy.calls.mostRecent().args[0])).toContain('conta deste');

    component.variableForm.accountId = 4;
    component.saveVariable();
    http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/transactions/20`).flush({ item: tx() });
    flushLedger();

    component.editingTx.set(tx({ id: 21 }));
    component.variableForm.accountId = 4;
    component.variableForm.name = 'Falha';
    component.variableForm.itemCategoryId = 10;
    component.saveVariable();
    http
      .expectOne(`${base}/transactions/21`)
      .flush({ error: 'não' }, { status: 422, statusText: 'err' });
    expect(alertSpy).toHaveBeenCalled();

    component.editingTx.set(
      tx({
        id: 30,
        kind: 'investment',
        notes: 'Aporte → Tesouro',
        category: 'Investimento',
      })
    );
    component.variableForm.kind = 'expense';
    component.variableForm.name = 'Aporte edit';
    component.variableForm.bankAccountId = 1;
    component.variableForm.financialAccountId = 3;
    component.saveVariable();
    http.expectOne(`${base}/transactions/30`).flush({ item: tx() });
    flushLedger();

    component.editingTx.set(tx({ id: 31, kind: 'transfer', notes: 'Transferência → X', transferLinkedTxId: 1 }));
    component.variableForm.name = 'Par';
    component.variableForm.bankAccountId = 1;
    component.variableForm.financialAccountId = 2;
    component.saveVariable();
    http
      .expectOne(`${base}/transactions/31`)
      .flush({ error: 'não' }, { status: 422, statusText: 'err' });
    expect(alertSpy).toHaveBeenCalled();

    component.editingTx.set(null);
    component.editingPending.set(null);
    component.variableForm.kind = 'expense';
    component.variableForm.name = 'Quebra';
    component.variableForm.itemCategoryId = 10;
    component.saveVariable();
    http
      .expectOne((r) => r.method === 'POST' && r.url === `${base}/month-plan`)
      .flush({ error: 'não' }, { status: 422, statusText: 'err' });
    expect(alertSpy).toHaveBeenCalled();
  });

  it('auto-confirms a new transfer and covers the miss and confirm-error paths', () => {
    const created = pending({
      id: 70,
      kind: 'transfer',
      status: 'pending',
      sourceFinancialAccountId: 1,
      financialAccountId: 2,
    });
    component.variableForm.kind = 'transfer';
    component.variableForm.name = 'Pix';
    component.variableForm.amount = 25;
    component.variableForm.bankAccountId = 1;
    component.variableForm.financialAccountId = 2;
    component.saveVariable();
    http.expectOne((r) => r.method === 'POST' && r.url === `${base}/month-plan`).flush(plan([created]));
    http.expectOne((r) => r.url === `${base}/month-plan/70/confirm`).flush(plan());
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    flushLedger();

    component.variableForm.kind = 'transfer';
    component.variableForm.name = 'Sem match';
    component.variableForm.amount = 25;
    component.variableForm.bankAccountId = 1;
    component.variableForm.financialAccountId = 2;
    component.saveVariable();
    http.expectOne((r) => r.method === 'POST' && r.url === `${base}/month-plan`).flush(plan());
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    flushLedger();

    const other = pending({ id: 71, kind: 'transfer', status: 'pending' });
    component.variableForm.kind = 'transfer';
    component.variableForm.name = 'Fallback';
    component.variableForm.amount = 25;
    component.variableForm.bankAccountId = 1;
    component.variableForm.financialAccountId = 2;
    component.saveVariable();
    http.expectOne((r) => r.method === 'POST' && r.url === `${base}/month-plan`).flush(
      plan([]) 
    );
    // sections empty but entries hold the fallback row
    // re-issue is already flushed; cover entries fallback with a dedicated call below
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    flushLedger();

    component.variableForm.kind = 'transfer';
    component.variableForm.name = 'Lista';
    component.variableForm.amount = 25;
    component.variableForm.bankAccountId = 1;
    component.variableForm.financialAccountId = 2;
    component.saveVariable();
    http.expectOne((r) => r.method === 'POST' && r.url === `${base}/month-plan`).flush({
      ...plan([]),
      sections: { today: [], overdue: [], upcoming: [other], variable: [], completed: [] },
    });
    http
      .expectOne((r) => r.url.includes('/confirm'))
      .flush({ error: 'falhou' }, { status: 422, statusText: 'err' });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    flushLedger();
    expect(alertSpy).toHaveBeenCalled();
  });

  it('confirms, patches, skips, removes and pays a bill', () => {
    const e = pending({ id: 5, suggestedAmount: 40, currency: 'BRL' });
    component.confirm(e);
    http
      .expectOne((r) => r.url === `${base}/accounts`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.busyId()).toBeNull();

    component.confirm(e);
    http.expectOne((r) => r.url === `${base}/accounts`).flush({
      items: [account({ id: 7, type: 'credit', name: 'Visa', dueDay: 10 })],
    });
    expect(component.confirmEntry()?.id).toBe(5);

    component.submitConfirm({
      accountId: 7,
      amount: 40,
      currency: 'BRL',
      kind: 'leisure',
      amountIn: 40,
      currencyIn: 'BRL',
    });
    expect(component.installmentPrompt()?.account.id).toBe(7);
    expect(component.installmentEach(100)).toBe(50);
    component.installmentCount.set(0);
    expect(component.installmentEach(10)).toBe(5);

    component.confirmWithoutInstallment();
    http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/month-plan/5`).flush(plan());
    http.expectOne((r) => r.url === `${base}/month-plan/5/confirm`).flush(plan());
    flushLedger();
    expect(component.confirmEntry()).toBeNull();

    component.confirmEntry.set(e);
    component.accounts.set([account({ id: 1, type: 'bank' })]);
    component.submitConfirm({
      accountId: 1,
      amount: 40,
      currency: 'BRL',
      kind: 'expense',
    });
    http
      .expectOne((r) => r.url === `${base}/month-plan/5/confirm`)
      .flush({ error: 'não' }, { status: 422, statusText: 'err' });
    expect(alertSpy).toHaveBeenCalled();

    component.confirmEntry.set(e);
    component.submitConfirm({
      accountId: 1,
      amount: 55,
      currency: 'EUR',
      kind: 'income',
      amountIn: 55,
      currencyIn: 'EUR',
    });
    http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/month-plan/5`).flush(plan());
    http.expectOne((r) => r.url.includes('/confirm')).flush(plan());
    flushLedger();

    component.confirmEntry.set(pending({ id: 6, recurringItemId: 3, kind: 'expense' }));
    component.submitConfirm({
      accountId: 1,
      amount: 10,
      currency: 'BRL',
      kind: 'income',
    });
    http
      .expectOne((r) => r.method === 'PUT' && r.url === `${base}/month-plan/6`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.confirmEntry()).toBeNull();

    component.submitConfirm({ accountId: 1, amount: 1, currency: 'BRL', kind: 'expense' });
    component.cancelConfirm();
    component.cancelInstallmentPrompt();
    expect(component.installmentPrompt()).toBeNull();

    component.setAmount(e, 40);
    component.saveAmount(e);
    http.expectNone((r) => r.url.includes('/month-plan/'));
    component.setAmount(e, 41);
    expect(component.amountFor(e)).toBe(41);
    expect(component.amountFor(pending({ id: 99, suggestedAmount: 3 }))).toBe(3);
    component.saveAmount(e);
    http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/month-plan/5`).flush(plan());
    flushLedger();

    component.skip(e);
    http.expectOne(`${base}/month-plan/5/skip`).flush(plan());
    flushLedger();
    component.skip(e);
    http
      .expectOne(`${base}/month-plan/5/skip`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.busyId()).toBeNull();

    component.removePending(pending({ id: 8, recurringItemId: 1 }));
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.and.returnValue(false);
    component.removePending(e);
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.and.returnValue(true);
    component.removePending(e);
    http.expectOne((r) => r.method === 'DELETE' && r.url === `${base}/month-plan/5`).flush({ ok: true });
    flushLedger();
    component.removePending(e);
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === `${base}/month-plan/5`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });

    const confirmed = tx({ id: 40, canUnconfirm: true, monthPlanEntryId: 5, description: 'Café' });
    component.unconfirmConfirmed(tx({ canUnconfirm: false, monthPlanEntryId: null }));
    confirmSpy.and.returnValue(false);
    component.unconfirmConfirmed(confirmed);
    confirmSpy.and.returnValue(true);
    component.unconfirmConfirmed(confirmed);
    http.expectOne(`${base}/month-plan/5/unconfirm`).flush(plan());
    flushLedger();
    component.unconfirmConfirmed(confirmed);
    http
      .expectOne(`${base}/month-plan/5/unconfirm`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    component.unconfirmConfirmed(tx({ id: 41, canUnconfirm: true, monthPlanEntryId: null }));
    http.expectOne(`${base}/transactions/41/unconfirm`).flush({ ok: true });
    flushLedger();
    component.unconfirmConfirmed(tx({ id: 42, canUnconfirm: true }));
    http
      .expectOne(`${base}/transactions/42/unconfirm`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });

    const billItem = {
      id: 3,
      name: 'Loja',
      amountBrl: 20,
      isInstallment: false,
      status: 'pending' as const,
      canCancel: true,
      monthPlanEntryId: 3,
    };
    component.cancelBillItem({ ...billItem, canCancel: false });
    expect(component.cancelBillPrompt()).toBeNull();
    component.cancelBillItem(billItem);
    component.confirmCancelBill();
    http.expectOne(`${base}/month-plan/3/skip`).flush(plan());
    flushLedger();
    component.cancelBillItem({ ...billItem, status: 'confirmed', monthPlanEntryId: 9 });
    component.confirmCancelBill();
    http.expectOne(`${base}/month-plan/9/unconfirm`).flush(plan());
    flushLedger();
    component.cancelBillItem({ ...billItem, status: 'confirmed', monthPlanEntryId: null });
    component.confirmCancelBill();
    expect(component.cancelBillPrompt()).toBeNull();
    component.cancelBillItem(billItem);
    component.confirmCancelBill();
    http
      .expectOne(`${base}/month-plan/3/skip`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    component.closeCancelBill();
    component.confirmCancelBill();

    component.payBillPrompt.set({
      accountId: 7,
      name: 'Nubank',
      forecast: { pendingBrl: 10, confirmedBrl: 0, totalBrl: 30 },
      paidBrl: 0,
      remainingBrl: 0,
      items: [
        { id: 1, name: 'A', amountBrl: 10, isInstallment: false, status: 'pending' as const },
        { id: 2, name: 'B', amountBrl: 5, isInstallment: false, status: 'payment' as const },
      ],
    });
    component.togglePayBillItem(1);
    component.togglePayBillItem(2);
    expect(component.payBillAmount()).toBe(10);
    component.togglePayBillItem(1);
    expect(component.isPayBillItemSelected(1)).toBeFalse();
    component.togglePayBillItem(1);
    component.payBillSelectedIds.set(new Set());
    component.togglePayBillItem(1);
    expect(component.payBillSelectableItems().map((i) => i.id)).toEqual([1]);
    component.submitPayBill();
    component.payBillBankId.set(null);
    component.submitPayBill();
    component.payBillAmount.set(0);
    component.payBillBankId.set(4);
    component.submitPayBill();
    component.cancelPayBill();

    component.openPayBill({
      accountId: 7,
      name: 'Nubank',
      forecast: { pendingBrl: 0, confirmedBrl: 0, totalBrl: 80 },
      paidBrl: 0,
      remainingBrl: 0,
      items: [],
    });
    http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [] });
    expect(component.payBillBankId()).toBeNull();
    expect(component.payBillAmount()).toBe(80);
    component.cancelPayBill();
  });

  it('creates an installment purchase and drops or keeps the original entry', () => {
    const e = pending({ id: 5, kind: 'leisure', name: 'Sofá', dueDay: 8, category: 'Casa', region: 'geral' });
    const result: ConfirmAccountResult = {
      accountId: 7,
      amount: 300,
      currency: 'BRL',
      kind: 'leisure',
      amountIn: 300,
      currencyIn: 'BRL',
      targetAccountId: 7,
    };
    component.installmentPrompt.set({
      entry: e,
      result,
      account: account({ id: 7, type: 'credit', dueDay: 12 }),
    });
    component.installmentCount.set(3);
    component.confirmWithInstallment();
    const save = http.expectOne((r) => r.method === 'POST' && r.url === `${base}/recurring-items`);
    expect(save.request.body.kind).toBe('expense');
    expect(save.request.body.isInstallment).toBeTrue();
    save.flush({ item: { id: 90 } });
    http.expectOne((r) => r.url === `${base}/ledger`).flush(
      emptyLedger({ pending: [pending({ id: 91, recurringItemId: 90 })] })
    );
    http.expectOne((r) => r.url === `${base}/month-plan/91/confirm`).flush(plan());
    http.expectOne((r) => r.method === 'DELETE' && r.url === `${base}/month-plan/5`).flush({ ok: true });
    flushLedger();

    component.installmentPrompt.set({
      entry: e,
      result,
      account: account({ id: 7, type: 'credit' }),
    });
    component.confirmWithInstallment();
    http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ item: { id: 90 } });
    http.expectOne((r) => r.url === `${base}/ledger`).flush(
      emptyLedger({ pending: [pending({ id: 91, recurringItemId: 90 })] })
    );
    http.expectOne((r) => r.url.includes('/confirm')).flush({ error: 'x' }, { status: 500, statusText: 'err' });
    http
      .expectOne((r) => r.method === 'DELETE')
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    flushLedger();
    expect(alertSpy).toHaveBeenCalled();

    component.installmentPrompt.set({
      entry: pending({ id: 5, recurringItemId: 2, kind: 'expense' }),
      result: { ...result, kind: 'expense' },
      account: account({ id: 7, type: 'credit' }),
    });
    component.confirmWithInstallment();
    http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ item: { id: 90 } });
    http.expectOne((r) => r.url === `${base}/ledger`).flush(emptyLedger());
    flushLedger();

    component.installmentPrompt.set({
      entry: e,
      result,
      account: account({ id: 7, type: 'credit' }),
    });
    component.confirmWithInstallment();
    http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ item: { id: 90 } });
    http
      .expectOne((r) => r.url === `${base}/ledger`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    flushLedger();

    component.installmentPrompt.set({
      entry: e,
      result,
      account: account({ id: 7, type: 'credit' }),
    });
    component.confirmWithInstallment();
    http
      .expectOne((r) => r.url === `${base}/recurring-items`)
      .flush({ error: 'x' }, { status: 422, statusText: 'err' });
    expect(String(alertSpy.calls.mostRecent().args[0])).toContain('parcelada');

    component.installmentPrompt.set(null);
    component.confirmWithInstallment();
    component.confirmWithoutInstallment();
  });
});
