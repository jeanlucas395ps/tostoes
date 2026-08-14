import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { MovementsPage } from './movements.page';
import { environment } from '../../../environments/environment';
import { CreditBill, CreditBillItem, FinancialAccount, LedgerView, MonthPlanEntry, Transaction } from '../../core/models/api.models';
import { ConfirmAccountResult } from '../../shared/components/confirm-account-dialog/confirm-account-dialog.component';

describe('MovementsPage', () => {
  let fixture: ComponentFixture<MovementsPage>;
  let component: MovementsPage;
  let http: HttpTestingController;
  let alertCreate: jasmine.Spy;
  let toastCreate: jasmine.Spy;
  const base = environment.apiUrl;

  const pendingFixed: MonthPlanEntry = {
    id: 1,
    kind: 'expense',
    name: 'Aluguel',
    category: 'Moradia',
    region: 'BR',
    recurringItemId: 10,
    dueDay: 5,
    suggestedAmountBrl: 1500,
    status: 'pending',
  };
  const pendingVariable: MonthPlanEntry = {
    id: 2,
    kind: 'expense',
    name: 'Mercado',
    category: 'Geral',
    region: 'BR',
    recurringItemId: null,
    dueDay: 20,
    suggestedAmountBrl: 300,
    status: 'pending',
  };
  const confirmedOlder: Transaction = {
    id: 100,
    transactionDate: '2026-07-01',
    kind: 'income',
    description: 'Salário',
    amount: 5000,
    currency: 'BRL',
    amountBrl: 5000,
    category: 'Salário',
    region: 'BR',
  };
  const confirmedNewer: Transaction = {
    id: 101,
    transactionDate: '2026-07-15',
    kind: 'expense',
    description: 'Luz',
    amount: 200,
    currency: 'BRL',
    amountBrl: 200,
    category: 'Energia',
    region: 'BR',
  };

  function flushLedger(overrides: Partial<LedgerView> = {}): void {
    const req = http.expectOne((r) => r.url === `${base}/ledger`);
    req.flush({
      year: 2026,
      month: 7,
      pending: [pendingFixed, pendingVariable],
      confirmed: [confirmedNewer, confirmedOlder],
      summary: {
        incomeTotal: 5000,
        expenseTotal: 200,
        balance: 4800,
        pendingCount: 2,
        confirmedCount: 2,
        projected: { income: 0, expense: 0, balance: 0 },
      },
      ...overrides,
    } as LedgerView);
  }

  beforeEach(async () => {
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {}, onDidDismiss: async () => ({}) });
    alertCreate = alertSpy.create;
    const toastSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastSpy.create.and.resolveTo({ present: async () => {} });
    toastCreate = toastSpy.create;

    await TestBed.configureTestingModule({
      imports: [MovementsPage, HttpClientTestingModule],
      providers: [
        { provide: AlertController, useValue: alertSpy },
        { provide: ToastController, useValue: toastSpy },
      ],
    })
      .overrideComponent(MovementsPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(MovementsPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne(`${base}/settings`).flush({ eurToBrlFallback: 6.1, usdToBrlFallback: 5.1 });
    http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [] });
    http.expectOne(`${base}/investment-types`).flush({ items: [] });
    http.expectOne(`${base}/auth/users`).flush({ items: [] });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    flushLedger();
  });

  afterEach(() => http.verify());

  it('starts on the pending segment', () => {
    expect(component.activeSegment()).toBe('pending');
  });

  it('sorts pending: variable entries first, then by due day, then by name', () => {
    const sorted = component.sortedPending();
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });

  it('sorts confirmed by transaction date ascending', () => {
    const sorted = component.sortedConfirmed();
    expect(sorted[0].id).toBe(100);
    expect(sorted[1].id).toBe(101);
  });

  it('skip() calls the skip endpoint and reloads the ledger', () => {
    component.skip(pendingFixed);
    http.expectOne(`${base}/month-plan/${pendingFixed.id}/skip`).flush({});
    flushLedger();
    expect(component.busyId()).toBeNull();
  });

  it('confirm() fetches accounts and opens the confirm dialog', () => {
    component.confirm(pendingVariable);
    http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [{ id: 9 } as never] });
    expect(component.confirmEntry()).toEqual(pendingVariable);
    expect(component.accounts().length).toBe(1);
  });

  it('confirm() clears busyId on error', () => {
    component.busyId.set(2);
    component.confirm(pendingVariable);
    http.expectOne((r) => r.url === `${base}/accounts`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.busyId()).toBeNull();
  });

  it('onRefresh reloads the ledger and completes the refresher', () => {
    const refresher = { complete: jasmine.createSpy('complete') } as unknown as HTMLIonRefresherElement;
    component.onRefresh({ target: refresher } as unknown as CustomEvent);
    flushLedger();
    expect(refresher.complete).toHaveBeenCalled();
  });

  it('loadLedger completes the refresher on error too', () => {
    const refresher = { complete: jasmine.createSpy('complete') } as unknown as HTMLIonRefresherElement;
    component.loadLedger(refresher);
    http.expectOne((r) => r.url === `${base}/ledger`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(refresher.complete).toHaveBeenCalled();
    expect(component.loading()).toBeFalse();
  });

  it('onYearChange and onMonthChange update signals and reload', () => {
    component.onYearChange(2025);
    flushLedger();
    expect(component.year()).toBe(2025);

    component.onMonthChange(3);
    flushLedger();
    expect(component.month()).toBe(3);
  });

  describe('label helpers', () => {
    it('isVariablePending / isVariableTx', () => {
      expect(component.isVariablePending(pendingFixed)).toBeFalse();
      expect(component.isVariablePending(pendingVariable)).toBeTrue();
      expect(component.isVariablePending({ ...pendingVariable, isGoal: true })).toBeFalse();

      expect(component.isVariableTx(confirmedOlder)).toBeFalse();
      expect(component.isVariableTx({ ...confirmedOlder, isVariablePlan: true })).toBeTrue();
      expect(component.isVariableTx({ ...confirmedOlder, category: 'Variável' })).toBeTrue();
    });

    it('entryCategoryLabel prefers the item category name', () => {
      expect(component.entryCategoryLabel(pendingFixed)).toBe('Moradia');
      expect(component.entryCategoryLabel({ ...pendingFixed, itemCategoryName: 'Casa' })).toBe('Casa');
    });

    it('entryTagLabel covers every branch', () => {
      expect(component.entryTagLabel({ kind: 'expense', isGoal: true })).toBe('Meta');
      expect(component.entryTagLabel({ kind: 'expense', isInstallment: true })).toBe('Parcela');
      expect(component.entryTagLabel({ kind: 'transfer' })).toBe('Transf.');
      expect(component.entryTagLabel({ kind: 'income' })).toBe('Receb.');
      expect(component.entryTagLabel({ kind: 'investment' })).toBe('Invest.');
      expect(component.entryTagLabel({ kind: 'expense' })).toBe('Gasto');
    });

    it('entryTagClass covers every branch', () => {
      expect(component.entryTagClass({ kind: 'expense', isGoal: true })).toBe('goal');
      expect(component.entryTagClass({ kind: 'expense', isInstallment: true })).toBe('installment');
      expect(component.entryTagClass({ kind: 'income' })).toBe('income');
    });

    it('txLabel appends the account name when present', () => {
      expect(component.txLabel(confirmedOlder)).not.toContain('·');
      expect(component.txLabel({ ...confirmedOlder, accountName: 'Nubank' })).toContain('Nubank');
    });

    it('transferMeta covers source+target, target-only and source-only', () => {
      expect(
        component.transferMeta({ ...confirmedOlder, transferSourceAccountName: 'A', transferTargetAccountName: 'B' })
      ).toBe('A → B');
      expect(component.transferMeta({ ...confirmedOlder, transferTargetAccountName: 'B' })).toBe('→ B');
      expect(component.transferMeta({ ...confirmedOlder, accountName: 'A' })).toBe('Saída: A');
      expect(component.transferMeta(confirmedOlder)).toBeNull();
    });
  });

  describe('taxonomy defaults', () => {
    it('defaultTabId / defaultCategoryId / categoryIdFromName', () => {
      expect(component.defaultTabId()).toBeNull();
      expect(component.defaultCategoryId()).toBeNull();
      expect(component.categoryIdFromName('mercado')).toBeNull();
    });
  });

  describe('variable form', () => {
    it('openNewVariable resets the form and opens the modal', () => {
      component.openNewVariable();
      expect(component.showVariableModal()).toBeTrue();
      expect(component.editingPending()).toBeNull();
      expect(component.editingTx()).toBeNull();
      expect(component.variableForm.kind).toBe('expense');
    });

    it('refreshFxPreview skips the request for BRL', () => {
      component.variableForm.currency = 'BRL';
      component.refreshFxPreview();
      expect(component.fxPreview()).toBeNull();
    });

    it('refreshFxPreview fetches the rate for foreign currencies', () => {
      component.variableForm.currency = 'EUR';
      component.variableForm.transactionDate = '2026-07-10';
      component.refreshFxPreview();
      const req = http.expectOne((r) => r.url === `${base}/fx/eur-brl`);
      req.flush({ date: '2026-07-10', eurToBrl: 6.3, usdToBrl: 5.2 });
      expect(component.fxPreview()?.eurToBrl).toBe(6.3);
    });

    it('refreshFxPreview clears the preview on error', () => {
      component.variableForm.currency = 'USD';
      component.refreshFxPreview();
      http.expectOne((r) => r.url === `${base}/fx/usd-brl`).flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.fxPreview()).toBeNull();
    });

    it('formPreviewBrl uses the live quote when available, otherwise the fallback rate', () => {
      component.variableForm.currency = 'USD';
      component.variableForm.amount = 10;
      expect(component.formPreviewBrl()).toBe(10 * component.usdToBrl());

      component.fxPreview.set({ date: '2026-07-10', eurToBrl: 6.3, usdToBrl: 5.5, source: 'api', fallback: false });
      expect(component.formPreviewBrl()).toBe(10 * 5.5);
    });

    it('openEditPending is a no-op for non-variable entries', () => {
      component.openEditPending(pendingFixed);
      expect(component.showVariableModal()).toBeFalse();
    });

    it('openEditPending populates the form for variable entries', () => {
      component.openEditPending(pendingVariable);
      expect(component.showVariableModal()).toBeTrue();
      expect(component.editingPending()).toEqual(pendingVariable);
      expect(component.variableForm.name).toBe('Mercado');
      http.expectNone((r) => r.url.includes('/fx/'));
    });

    it('openEditConfirmed is a no-op for non-variable transactions', () => {
      component.openEditConfirmed(confirmedOlder);
      expect(component.showVariableModal()).toBeFalse();
    });

    it('openEditConfirmed populates the form and normalizes the "Variável" category', () => {
      component.openEditConfirmed({ ...confirmedNewer, isVariablePlan: true, category: 'Variável' });
      expect(component.showVariableModal()).toBeTrue();
      expect(component.variableForm.category).toBe('Geral');
      expect(component.editingTx()?.id).toBe(confirmedNewer.id);
    });

    it('onCategorySelect enters new-category mode', () => {
      component.onCategorySelect('__new__');
      expect(component.newCategoryMode()).toBeTrue();
      expect(component.variableForm.itemCategoryId).toBeNull();
    });

    it('onCategorySelect assigns an existing category id', () => {
      component.itemCategories.set([{ id: 5, name: 'Mercado', icon: 'shopping-cart' } as never]);
      component.onCategorySelect(5);
      expect(component.newCategoryMode()).toBeFalse();
      expect(component.variableForm.itemCategoryId).toBe(5);
      expect(component.variableForm.category).toBe('Mercado');
    });

    it('onNewCategoryNameChange only updates the icon while in new-category mode', () => {
      component.newCategoryMode.set(false);
      component.onNewCategoryNameChange('Academia');
      expect(component.variableForm.newCategoryName).toBe('Academia');

      component.newCategoryMode.set(true);
      component.onNewCategoryNameChange('Mercado');
      expect(component.variableForm.newCategoryIcon).toBe('shopping-cart');
    });

    it('closeVariableModal resets modal state', () => {
      component.showVariableModal.set(true);
      component.editingPending.set(pendingVariable);
      component.editingTx.set(confirmedOlder);
      component.fxPreview.set({ date: 'x', eurToBrl: 6, usdToBrl: 5, source: 'api', fallback: false });
      component.closeVariableModal();
      expect(component.showVariableModal()).toBeFalse();
      expect(component.editingPending()).toBeNull();
      expect(component.editingTx()).toBeNull();
      expect(component.fxPreview()).toBeNull();
    });
  });

  describe('saveVariable', () => {
    it('does nothing when the name is blank', async () => {
      component.variableForm.name = '   ';
      await component.saveVariable();
      expect(component.showVariableModal()).toBeFalse();
      http.expectNone((r) => r.url === `${base}/month-plan`);
    });

    it('does nothing when a category is required but missing', async () => {
      component.variableForm.name = 'Compra';
      component.variableForm.itemCategoryId = null;
      await component.saveVariable();
      expect(component.showVariableModal()).toBeFalse();
      http.expectNone((r) => r.url === `${base}/month-plan`);
    });

    it('prompts for the investment type when missing', async () => {
      component.variableForm.name = 'Aporte';
      component.variableForm.kind = 'investment';
      component.variableForm.investmentTypeId = null;
      await component.saveVariable();
      expect(toastCreate).toHaveBeenCalled();
      http.expectNone((r) => r.url === `${base}/month-plan`);
    });

    it('requires an account when editing a confirmed transaction', async () => {
      component.itemCategories.set([{ id: 4, name: 'Energia', icon: 'zap' } as never]);
      component.openEditConfirmed({ ...confirmedNewer, isVariablePlan: true });
      component.variableForm.accountId = null;
      await component.saveVariable();
      expect(toastCreate).toHaveBeenCalled();
      http.expectNone((r) => r.url === `${base}/transactions/${confirmedNewer.id}`);
    });

    it('updates a confirmed transaction and reloads', async () => {
      component.itemCategories.set([{ id: 4, name: 'Energia', icon: 'zap' } as never]);
      component.openEditConfirmed({ ...confirmedNewer, isVariablePlan: true });
      component.variableForm.accountId = 9;
      const savePromise = component.saveVariable();
      const req = http.expectOne((r) => r.url === `${base}/transactions/${confirmedNewer.id}` && r.method === 'PUT');
      req.flush({ item: confirmedNewer });
      await savePromise;
      flushLedger();
      expect(component.showVariableModal()).toBeFalse();
    });

    it('updates a pending entry and reloads', async () => {
      component.itemCategories.set([{ id: 3, name: 'Geral', icon: 'package' } as never]);
      component.openEditPending(pendingVariable);
      const savePromise = component.saveVariable();
      const req = http.expectOne((r) => r.url === `${base}/month-plan/${pendingVariable.id}` && r.method === 'PUT');
      req.flush({});
      await savePromise;
      flushLedger();
      expect(component.showVariableModal()).toBeFalse();
    });

    it('creates a new entry, refreshes taxonomy, and reloads', async () => {
      component.itemCategories.set([{ id: 3, name: 'Geral', icon: 'package' } as never]);
      component.openNewVariable();
      component.variableForm.name = 'Farmácia';
      component.variableForm.itemCategoryId = 3;
      const savePromise = component.saveVariable();
      const req = http.expectOne((r) => r.url === `${base}/month-plan` && r.method === 'POST');
      req.flush({});
      await savePromise;
      http.expectOne((r) => r.url === `${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
      flushLedger();
      expect(component.showVariableModal()).toBeFalse();
    });

    it('builds a "Transferência" taxonomy for transfers', async () => {
      component.openNewVariable();
      component.variableForm.kind = 'transfer';
      component.variableForm.name = 'Envio';
      const savePromise = component.saveVariable();
      const req = http.expectOne((r) => r.url === `${base}/month-plan` && r.method === 'POST');
      expect(req.request.body.category).toBe('Transferência');
      req.flush({});
      await savePromise;
      http.expectOne((r) => r.url === `${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
      flushLedger();
    });
  });

  describe('submitConfirm', () => {
    it('does nothing without a pending confirm entry', () => {
      component.confirmEntry.set(null);
      component.submitConfirm({ accountId: 1, amount: 10, currency: 'BRL', kind: 'expense' });
      expect(component.confirmEntry()).toBeNull();
      http.expectNone((r) => r.url.includes('/confirm'));
    });

    it('confirms directly when nothing about the entry changed', () => {
      component.confirmEntry.set(pendingFixed);
      const result: ConfirmAccountResult = { accountId: 1, amount: 1500, currency: 'BRL', kind: 'expense' };
      component.submitConfirm(result);
      const req = http.expectOne((r) => r.url === `${base}/month-plan/${pendingFixed.id}/confirm`);
      req.flush({});
      flushLedger();
      expect(component.confirmEntry()).toBeNull();
      expect(component.busyId()).toBeNull();
    });

    it('patches the entry first when the amount changed, then confirms', () => {
      component.confirmEntry.set(pendingVariable);
      const result: ConfirmAccountResult = { accountId: 1, amount: 999, currency: 'BRL', kind: 'expense' };
      component.submitConfirm(result);
      const patchReq = http.expectOne((r) => r.url === `${base}/month-plan/${pendingVariable.id}` && r.method === 'PUT');
      expect(patchReq.request.body.suggestedAmount).toBe(999);
      patchReq.flush({});
      const confirmReq = http.expectOne((r) => r.url === `${base}/month-plan/${pendingVariable.id}/confirm`);
      confirmReq.flush({});
      flushLedger();
      expect(component.confirmEntry()).toBeNull();
    });

    it('cancels the confirm flow when the patch fails', () => {
      component.confirmEntry.set(pendingVariable);
      const result: ConfirmAccountResult = { accountId: 1, amount: 1, currency: 'BRL', kind: 'income' };
      component.submitConfirm(result);
      http.expectOne((r) => r.url === `${base}/month-plan/${pendingVariable.id}` && r.method === 'PUT').flush(
        {},
        { status: 500, statusText: 'Server Error' }
      );
      expect(component.confirmEntry()).toBeNull();
      expect(component.busyId()).toBeNull();
    });

    it('clears state when the confirm call itself fails', () => {
      component.confirmEntry.set(pendingFixed);
      const result: ConfirmAccountResult = { accountId: 1, amount: 1500, currency: 'BRL', kind: 'expense' };
      component.submitConfirm(result);
      http.expectOne((r) => r.url === `${base}/month-plan/${pendingFixed.id}/confirm`).flush(
        {},
        { status: 500, statusText: 'Server Error' }
      );
      expect(component.confirmEntry()).toBeNull();
      expect(component.busyId()).toBeNull();
    });
  });

  it('cancelConfirm clears the confirm state', () => {
    component.confirmEntry.set(pendingFixed);
    component.busyId.set(pendingFixed.id);
    component.cancelConfirm();
    expect(component.confirmEntry()).toBeNull();
    expect(component.busyId()).toBeNull();
  });

  describe('credit bill flows', () => {
    const bill: CreditBill = {
      accountId: 7,
      name: 'Nubank',
      forecast: { pendingBrl: 100, confirmedBrl: 0, totalBrl: 100 },
      paidBrl: 0,
      remainingBrl: 100,
      items: [],
    };

    it('openPayBill fetches accounts and preselects a bank account', () => {
      component.openPayBill(bill);
      http.expectOne((r) => r.url === `${base}/accounts`).flush({
        items: [{ id: 4, type: 'bank' } as FinancialAccount, { id: 5, type: 'investment' } as FinancialAccount],
      });
      expect(component.payBillBankId()).toBe(4);
      expect(component.payBillPrompt()).toEqual(bill);
    });

    it('cancelPayBill clears the prompt', () => {
      component.payBillPrompt.set(bill);
      component.cancelPayBill();
      expect(component.payBillPrompt()).toBeNull();
    });

    it('submitPayBill is a no-op without a bill, bank id, or remaining balance', async () => {
      component.payBillPrompt.set(null);
      component.payBillBankId.set(4);
      await component.submitPayBill();
      expect(component.payBillPrompt()).toBeNull();
      http.expectNone((r) => r.url === `${base}/month-plan`);

      component.payBillPrompt.set({ ...bill, remainingBrl: 0 });
      await component.submitPayBill();
      expect(component.payBillPrompt()?.remainingBrl).toBe(0);
      http.expectNone((r) => r.url === `${base}/month-plan`);
    });

    it('submitPayBill creates the transfer and auto-confirms the matching entry', async () => {
      component.payBillPrompt.set(bill);
      component.payBillBankId.set(4);
      const submitPromise = component.submitPayBill();
      const req = http.expectOne((r) => r.url === `${base}/month-plan` && r.method === 'POST');
      req.flush({
        sections: {
          variable: [
            {
              id: 55,
              kind: 'transfer',
              status: 'pending',
              name: 'Pagamento fatura · Nubank',
              sourceFinancialAccountId: 4,
            },
          ],
        },
      });
      const confirmReq = http.expectOne((r) => r.url === `${base}/month-plan/55/confirm`);
      confirmReq.flush({});
      await submitPromise;
      flushLedger();
      expect(component.payBillPrompt()).toBeNull();
    });

    it('submitPayBill reloads directly when no matching entry is found', async () => {
      component.payBillPrompt.set(bill);
      component.payBillBankId.set(4);
      const submitPromise = component.submitPayBill();
      const req = http.expectOne((r) => r.url === `${base}/month-plan` && r.method === 'POST');
      req.flush({ sections: {} });
      await submitPromise;
      flushLedger();
      expect(component.payBillPrompt()).toBeNull();
    });

    it('submitPayBill shows a toast when the request fails', async () => {
      component.payBillPrompt.set(bill);
      component.payBillBankId.set(4);
      const submitPromise = component.submitPayBill();
      http.expectOne((r) => r.url === `${base}/month-plan` && r.method === 'POST').flush(
        {},
        { status: 500, statusText: 'Server Error' }
      );
      await submitPromise;
      expect(toastCreate).toHaveBeenCalled();
    });

    it('cancelBillItem is a no-op when the item cannot be canceled', async () => {
      await component.cancelBillItem({ id: 1, name: 'x', amountBrl: 10, isInstallment: false, status: 'pending', canCancel: false });
      expect(alertCreate).not.toHaveBeenCalled();
    });

    it('cancelBillItem skips a pending charge after confirming', async () => {
      const item: CreditBillItem = { id: 8, name: 'Parcela', amountBrl: 50, isInstallment: true, status: 'pending' };
      await component.cancelBillItem(item);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/month-plan/8/skip`).flush({});
      flushLedger();
      expect(component.busyId()).toBeNull();
    });

    it('cancelBillItem unconfirms a confirmed charge via its monthPlanEntryId', async () => {
      const item: CreditBillItem = { id: 8, name: 'Parcela', amountBrl: 50, isInstallment: true, status: 'confirmed', monthPlanEntryId: 9 };
      await component.cancelBillItem(item);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/month-plan/9/unconfirm`).flush({});
      flushLedger();
      expect(component.busyId()).toBeNull();
    });
  });

  it('removePending is a no-op for non-variable entries', async () => {
    await component.removePending(pendingFixed);
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('removePending deletes a variable entry after confirming', async () => {
    await component.removePending(pendingVariable);
    const config = alertCreate.calls.mostRecent().args[0];
    const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
    destructive.handler();
    http.expectOne(`${base}/month-plan/${pendingVariable.id}`).flush({ ok: true });
    flushLedger();
    expect(component.busyId()).toBeNull();
  });

  it('removePending clears busyId on delete failure', async () => {
    await component.removePending(pendingVariable);
    const config = alertCreate.calls.mostRecent().args[0];
    const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
    destructive.handler();
    http.expectOne(`${base}/month-plan/${pendingVariable.id}`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.busyId()).toBeNull();
  });

  describe('unconfirmConfirmed', () => {
    it('is a no-op when the transaction cannot be undone', async () => {
      await component.unconfirmConfirmed(confirmedOlder);
      expect(alertCreate).not.toHaveBeenCalled();
    });

    it('unconfirms via the linked month-plan entry when present', async () => {
      const tx = { ...confirmedOlder, canUnconfirm: true, monthPlanEntryId: 42 };
      await component.unconfirmConfirmed(tx);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/month-plan/42/unconfirm`).flush({});
      flushLedger();
      expect(component.busyId()).toBeNull();
    });

    it('unconfirms via the transaction endpoint otherwise', async () => {
      const tx = { ...confirmedOlder, canUnconfirm: true };
      await component.unconfirmConfirmed(tx);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/transactions/${tx.id}/unconfirm`).flush({ ok: true });
      flushLedger();
      expect(component.busyId()).toBeNull();
    });

    it('clears busyId when unconfirming fails', async () => {
      const tx = { ...confirmedOlder, canUnconfirm: true };
      await component.unconfirmConfirmed(tx);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/transactions/${tx.id}/unconfirm`).flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.busyId()).toBeNull();
    });
  });

  describe('additional branch coverage', () => {
    it('variableUsesTabs is true for income too', () => {
      component.variableForm.kind = 'income';
      expect(component.variableUsesTabs()).toBeTrue();
    });

    it('sortedPending/sortedConfirmed tolerate a missing ledger', () => {
      component.ledger.set(null);
      expect(component.sortedPending()).toEqual([]);
      expect(component.sortedConfirmed()).toEqual([]);
    });

    it('breaks pending ties by due day then by name', () => {
      const a = { ...pendingVariable, id: 3, name: 'Zebra', dueDay: 5 };
      const b = { ...pendingVariable, id: 4, name: 'Abelha', dueDay: 5 };
      component.ledger.set({ ...component.ledger()!, pending: [a, b] });
      expect(component.sortedPending().map((e) => e.id)).toEqual([4, 3]);
    });

    it('breaks confirmed ties by id when the date matches', () => {
      const a = { ...confirmedOlder, id: 200, transactionDate: '2026-07-10' };
      const b = { ...confirmedOlder, id: 199, transactionDate: '2026-07-10' };
      component.ledger.set({ ...component.ledger()!, confirmed: [a, b] });
      expect(component.sortedConfirmed().map((t) => t.id)).toEqual([199, 200]);
    });

    it('exposes credit bills from the ledger', () => {
      const bill = { accountId: 1, name: 'Nubank', forecast: { pendingBrl: 0, confirmedBrl: 0, totalBrl: 0 }, paidBrl: 0, remainingBrl: 0, items: [] };
      component.ledger.set({ ...component.ledger()!, creditBills: [bill] });
      expect(component.creditBills()).toEqual([bill]);
    });

    it('filters accounts by type via the computed lists', () => {
      component.accounts.set([
        { id: 1, type: 'bank' } as never,
        { id: 2, type: 'investment' } as never,
        { id: 3, type: 'credit' } as never,
      ]);
      expect(component.bankAccounts().map((a) => a.id)).toEqual([1]);
      expect(component.investmentAccounts().map((a) => a.id)).toEqual([2]);
      expect(component.allAccounts().length).toBe(3);
    });

    it('titles the modal "Novo variável" when nothing is being edited', () => {
      component.openNewVariable();
      expect(component.variableModalTitle()).toBe('Novo variável');
    });

    it('falls back to the primary fx rate and default USD rate when settings omit the fallback', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [MovementsPage, HttpClientTestingModule],
        providers: [
          { provide: AlertController, useValue: jasmine.createSpyObj('AlertController', ['create']) },
          { provide: ToastController, useValue: jasmine.createSpyObj('ToastController', ['create']) },
        ],
      })
        .overrideComponent(MovementsPage, { set: { template: '<div></div>', imports: [] } })
        .compileComponents();
      const freshFixture = TestBed.createComponent(MovementsPage);
      const freshComponent = freshFixture.componentInstance;
      const freshHttp = TestBed.inject(HttpTestingController);
      freshFixture.detectChanges();

      freshHttp.expectOne(`${base}/settings`).flush({ eurToBrl: 6, usdToBrl: undefined });
      freshHttp.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [] });
      freshHttp.expectOne(`${base}/investment-types`).flush({ items: [] });
      freshHttp.expectOne(`${base}/auth/users`).flush({ items: [] });
      freshHttp.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
      freshHttp.expectOne((r) => r.url === `${base}/ledger`).flush({
        year: 2026,
        month: 8,
        pending: [],
        confirmed: [],
        summary: { incomeTotal: 0, expenseTotal: 0, balance: 0, pendingCount: 0, confirmedCount: 0, projected: { income: 0, expense: 0, balance: 0 } },
      } as unknown as LedgerView);

      expect(freshComponent.eurToBrl()).toBe(6);
      expect(freshComponent.usdToBrl()).toBe(5);
      freshHttp.verify();
    });

    it('pendingLabel formats the suggested amount', () => {
      expect(component.pendingLabel(pendingFixed)).toContain('1.500');
    });

    it('resetVariableForm defaults to an expense', () => {
      component.resetVariableForm();
      expect(component.variableForm.kind).toBe('expense');
    });

    it('formPreviewBrl uses the eurToBrl fallback for EUR', () => {
      component.variableForm.currency = 'EUR';
      component.variableForm.amount = 10;
      component.fxPreview.set(null);
      expect(component.formPreviewBrl()).toBe(10 * component.eurToBrl());
    });

    it('derives region from a Brasil/Portugal custom tab name', () => {
      component.customTabs.set([
        { id: 1, name: 'Gastos Brasil', sortOrder: 0 } as never,
        { id: 2, name: 'Gastos Portugal', sortOrder: 1 } as never,
      ]);
      component.itemCategories.set([{ id: 9, name: 'Geral', icon: 'package' } as never]);

      component.openNewVariable();
      component.variableForm.name = 'Item BR';
      component.variableForm.itemCategoryId = 9;
      component.variableForm.customTabId = 1;
      component.saveVariable();
      let req = http.expectOne(`${base}/month-plan`);
      expect(req.request.body.region).toBe('BR');
      req.flush({});
      http.expectOne((r) => r.url === `${base}/planning-taxonomy`).flush({
        customTabs: [
          { id: 1, name: 'Gastos Brasil', sortOrder: 0 },
          { id: 2, name: 'Gastos Portugal', sortOrder: 1 },
        ],
        itemCategories: [{ id: 9, name: 'Geral', icon: 'package' }],
      });
      flushLedger();

      component.openNewVariable();
      component.variableForm.name = 'Item PT';
      component.variableForm.itemCategoryId = 9;
      component.variableForm.customTabId = 2;
      component.saveVariable();
      req = http.expectOne(`${base}/month-plan`);
      expect(req.request.body.region).toBe('PT');
      req.flush({});
      http.expectOne((r) => r.url === `${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
      flushLedger();
    });

    it('treats a kind change on a variable entry as needing a patch', () => {
      component.confirmEntry.set(pendingVariable);
      const result: ConfirmAccountResult = { accountId: 1, amount: 300, currency: 'BRL', kind: 'income' };
      component.submitConfirm(result);
      const patchReq = http.expectOne((r) => r.url === `${base}/month-plan/${pendingVariable.id}` && r.method === 'PUT');
      expect(patchReq.request.body.kind).toBe('income');
      patchReq.flush({});
      http.expectOne((r) => r.url === `${base}/month-plan/${pendingVariable.id}/confirm`).flush({});
      flushLedger();
    });

    it('openPayBill leaves the bank id null when there is no bank account', () => {
      const bill = { accountId: 1, name: 'Nubank', forecast: { pendingBrl: 0, confirmedBrl: 0, totalBrl: 0 }, paidBrl: 0, remainingBrl: 100, items: [] };
      component.openPayBill(bill);
      http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [{ id: 9, type: 'investment' } as never] });
      expect(component.payBillBankId()).toBeNull();
    });

    it('matches the auto-confirm entry by source account when the name differs', async () => {
      const bill = { accountId: 5, name: 'Fatura X', forecast: { pendingBrl: 0, confirmedBrl: 0, totalBrl: 0 }, paidBrl: 0, remainingBrl: 80, items: [] };
      component.payBillPrompt.set(bill);
      component.payBillBankId.set(4);
      const submitPromise = component.submitPayBill();
      const req = http.expectOne((r) => r.url === `${base}/month-plan` && r.method === 'POST');
      req.flush({
        sections: {
          today: [{ id: 61, kind: 'transfer', status: 'pending', name: 'Outro nome qualquer', sourceFinancialAccountId: 4 }],
        },
      });
      http.expectOne(`${base}/month-plan/61/confirm`).flush({});
      await submitPromise;
      flushLedger();
    });

    it('confirmCancelBill falls back to the item id when there is no monthPlanEntryId', async () => {
      const item = { id: 42, name: 'Parcela', amountBrl: 10, isInstallment: true, status: 'pending' as const };
      await component.cancelBillItem(item);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/month-plan/42/skip`).flush({});
      flushLedger();
    });

    it('confirmCancelBill does nothing for a confirmed charge without a monthPlanEntryId', async () => {
      const item = { id: 43, name: 'Parcela', amountBrl: 10, isInstallment: true, status: 'confirmed' as const };
      await component.cancelBillItem(item);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectNone((r) => r.url.includes('/skip') || r.url.includes('/unconfirm'));
    });
  });
});
