import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmAccountDialogComponent } from './confirm-account-dialog.component';
import { FinancialAccount, MonthPlanEntry } from '../../../core/models/api.models';

describe('ConfirmAccountDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmAccountDialogComponent>;
  let cmp: ConfirmAccountDialogComponent;

  const bank: FinancialAccount = {
    id: 1,
    name: 'Nubank Conta',
    type: 'bank',
    currency: 'BRL',
    initialBalance: 100,
    initialBalanceDate: '2026-01-01',
    sortOrder: 0,
    balance: 100,
    balanceBrl: 100,
  };

  const bank2: FinancialAccount = {
    ...bank,
    id: 4,
    name: 'Inter',
    balance: 50,
    balanceBrl: 50,
  };

  const credit: FinancialAccount = {
    id: 2,
    name: 'Nubank Cartão',
    type: 'credit',
    currency: 'BRL',
    initialBalance: 0,
    initialBalanceDate: '2026-01-01',
    sortOrder: 0,
    balance: 200,
    balanceBrl: 200,
    usedLimit: 200,
    usedLimitBrl: 200,
    creditLimit: 5000,
  };

  const investment: FinancialAccount = {
    id: 3,
    name: 'Tesouro',
    type: 'investment',
    currency: 'BRL',
    initialBalance: 0,
    initialBalanceDate: '2026-01-01',
    sortOrder: 0,
    balance: 1000,
    balanceBrl: 1000,
  };

  const entry: MonthPlanEntry = {
    id: 10,
    kind: 'expense',
    name: 'Mercado',
    category: 'Geral',
    region: 'geral',
    suggestedAmountBrl: 50,
    currency: 'BRL',
    status: 'pending',
  };

  function setup(
    e: MonthPlanEntry = entry,
    accounts: FinancialAccount[] = [bank, credit, investment, bank2],
    amount: number | null = null
  ): void {
    fixture.componentRef.setInput('entry', e);
    fixture.componentRef.setInput('accounts', accounts);
    fixture.componentRef.setInput('amount', amount);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmAccountDialogComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ConfirmAccountDialogComponent);
    cmp = fixture.componentInstance;
    setup();
  });

  it('lists bank and credit as payment accounts', () => {
    expect(cmp.paymentAccounts().map((a) => a.type).sort()).toEqual(['bank', 'bank', 'credit']);
  });

  it('lists investment and all accounts', () => {
    expect(cmp.investmentAccounts().map((a) => a.id)).toEqual([3]);
    expect(cmp.allAccounts().length).toBe(4);
  });

  it('lists only banks for income sources', () => {
    expect(cmp.bankAccounts().map((a) => a.id).sort()).toEqual([1, 4]);
  });

  it('accountBalanceLabel for bank and credit', () => {
    expect(cmp.accountBalanceLabel(bank)).toContain('100');
    expect(cmp.accountBalanceLabel(credit)).toContain('usado');
  });

  it('accountBalanceLabel falls back when credit usedLimit missing', () => {
    const bare: FinancialAccount = {
      ...credit,
      usedLimit: undefined,
      usedLimitBrl: undefined,
      balance: 150,
      balanceBrl: 150,
    };
    expect(cmp.accountBalanceLabel(bare)).toContain('usado');
    expect(cmp.accountBalanceLabel(bare)).toContain('150');
  });

  it('defaults currency to BRL when entry has none', () => {
    setup({ ...entry, currency: undefined as unknown as 'BRL' });
    expect(cmp.editCurrency()).toBe('BRL');
    expect(cmp.editCurrencyIn()).toBe('BRL');
  });

  it('sorts multiple investment accounts', () => {
    const inv2: FinancialAccount = {
      ...investment,
      id: 5,
      name: 'Ações',
    };
    setup(entry, [bank, investment, inv2]);
    expect(cmp.investmentAccounts().map((a) => a.name)).toEqual(['Ações', 'Tesouro']);
  });

  it('requires payment account to submit expense', () => {
    cmp.editKind.set('expense');
    cmp.editAmount.set(50);
    cmp.bankAccountId.set(null);
    expect(cmp.canSubmit()).toBeFalse();
    cmp.bankAccountId.set(2);
    expect(cmp.canSubmit()).toBeTrue();
  });

  it('blocks non-income with amount <= 0', () => {
    cmp.editKind.set('expense');
    cmp.editAmount.set(0);
    cmp.bankAccountId.set(1);
    expect(cmp.canSubmit()).toBeFalse();
    cmp.editKind.set('income');
    cmp.editAmount.set(0);
    expect(cmp.canSubmit()).toBeTrue();
  });

  it('emits credit accountId on submit', () => {
    const spy = jasmine.createSpy('confirmed');
    cmp.confirmed.subscribe(spy);
    cmp.editKind.set('expense');
    cmp.editAmount.set(50);
    cmp.bankAccountId.set(2);
    cmp.submit();
    expect(spy.calls.mostRecent().args[0].accountId).toBe(2);
  });

  it('submit without bank is no-op', () => {
    const spy = jasmine.createSpy('confirmed');
    cmp.confirmed.subscribe(spy);
    cmp.editKind.set('expense');
    cmp.bankAccountId.set(null);
    cmp.submit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('accountTypeShort distinguishes credit', () => {
    expect(cmp.accountTypeShort('credit')).toBe('Cartão');
    expect(cmp.accountTypeShort('bank')).toBe('Banco');
    expect(cmp.accountTypeShort('investment')).toBe('Invest.');
  });

  it('canEditKind false for recurring and goals', () => {
    setup({ ...entry, recurringItemId: 9 });
    expect(cmp.canEditKind()).toBeFalse();
    setup({ ...entry, isGoal: true });
    expect(cmp.canEditKind()).toBeFalse();
  });

  it('uses amount input override', () => {
    setup(entry, [bank, credit], 77);
    expect(cmp.editAmount()).toBe(77);
  });

  it('investment flow presets and submit', () => {
    const invEntry: MonthPlanEntry = {
      ...entry,
      kind: 'investment',
      financialAccountId: 3,
      financialAccountName: 'Tesouro',
      sourceFinancialAccountId: 1,
    };
    setup(invEntry, [bank, investment]);
    expect(cmp.isInvestment()).toBeTrue();
    expect(cmp.presetInvestmentAccountName()).toBe('Tesouro');
    expect(cmp.investmentAccountId()).toBe(3);
    expect(cmp.bankAccountId()).toBe(1);
    expect(cmp.canSubmit()).toBeTrue();

    const spy = jasmine.createSpy('confirmed');
    cmp.confirmed.subscribe(spy);
    cmp.submit();
    expect(spy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        accountId: 1,
        targetAccountId: 3,
        kind: 'investment',
      })
    );
  });

  it('investment canSubmit requires both accounts', () => {
    cmp.editKind.set('investment');
    cmp.editAmount.set(10);
    cmp.bankAccountId.set(1);
    cmp.investmentAccountId.set(null);
    expect(cmp.canSubmit()).toBeFalse();
    cmp.investmentAccountId.set(3);
    expect(cmp.canSubmit()).toBeTrue();
  });

  it('investment submit without inv is no-op', () => {
    const spy = jasmine.createSpy('confirmed');
    cmp.confirmed.subscribe(spy);
    cmp.editKind.set('investment');
    cmp.editAmount.set(10);
    cmp.bankAccountId.set(1);
    cmp.investmentAccountId.set(null);
    cmp.submit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('auto-selects sole bank for investment', () => {
    setup(
      { ...entry, kind: 'investment', financialAccountId: 3 },
      [bank, investment]
    );
    expect(cmp.bankAccountId()).toBe(1);
  });

  it('transfer flow presets, validates and emits', () => {
    const tEntry: MonthPlanEntry = {
      ...entry,
      kind: 'transfer',
      sourceFinancialAccountId: 1,
      financialAccountId: 4,
      suggestedAmountBrl: 20,
    };
    setup(tEntry, [bank, bank2]);
    expect(cmp.isTransfer()).toBeTrue();
    expect(cmp.sourceAccountId()).toBe(1);
    expect(cmp.targetAccountId()).toBe(4);
    expect(cmp.canSubmit()).toBeTrue();

    cmp.sourceAccountId.set(1);
    cmp.targetAccountId.set(1);
    expect(cmp.canSubmit()).toBeFalse();

    cmp.targetAccountId.set(4);
    cmp.editAmountIn.set(0);
    expect(cmp.canSubmit()).toBeFalse();
    cmp.editAmountIn.set(20);

    const spy = jasmine.createSpy('confirmed');
    cmp.cancelled.subscribe(jasmine.createSpy('cancelled'));
    cmp.confirmed.subscribe(spy);
    cmp.submit();
    expect(spy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        accountId: 1,
        targetAccountId: 4,
        kind: 'transfer',
        amountIn: 20,
      })
    );
  });

  it('transfer submit without accounts is no-op', () => {
    const spy = jasmine.createSpy('confirmed');
    cmp.confirmed.subscribe(spy);
    cmp.editKind.set('transfer');
    cmp.sourceAccountId.set(null);
    cmp.targetAccountId.set(null);
    cmp.editAmount.set(10);
    cmp.editAmountIn.set(10);
    cmp.submit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('expense with sourceFinancialAccountId presets bank', () => {
    setup({ ...entry, sourceFinancialAccountId: 4 }, [bank, bank2, credit]);
    expect(cmp.bankAccountId()).toBe(4);
  });

  it('onOutCurrencyOrAmountChange syncs when currencies match', () => {
    cmp.editCurrency.set('BRL');
    cmp.editCurrencyIn.set('BRL');
    cmp.editAmount.set(33);
    cmp.onOutCurrencyOrAmountChange();
    expect(cmp.editAmountIn()).toBe(33);

    cmp.editCurrencyIn.set('EUR');
    cmp.editAmount.set(40);
    cmp.onOutCurrencyOrAmountChange();
    expect(cmp.editAmountIn()).toBe(33);
  });

  it('kind labels cover all kinds', () => {
    expect(cmp.kindLabels.leisure).toContain('Lazer');
    expect(cmp.kindOptions).toContain('transfer');
  });
});
