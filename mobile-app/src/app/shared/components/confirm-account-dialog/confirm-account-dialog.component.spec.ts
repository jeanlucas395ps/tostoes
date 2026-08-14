import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmAccountDialogComponent, ConfirmAccountResult } from './confirm-account-dialog.component';
import { FinancialAccount, MonthPlanEntry } from '../../../core/models/api.models';

describe('ConfirmAccountDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmAccountDialogComponent>;
  let component: ConfirmAccountDialogComponent;

  const bank1: FinancialAccount = {
    id: 1,
    name: 'Nubank',
    type: 'bank',
    currency: 'BRL',
    initialBalance: 0,
    initialBalanceDate: '2026-01-01',
    sortOrder: 0,
    balance: 1000,
    balanceBrl: 1000,
  };
  const bank2: FinancialAccount = { ...bank1, id: 2, name: 'Itaú' };
  const credit1: FinancialAccount = {
    ...bank1,
    id: 3,
    name: 'Cartão',
    type: 'credit',
    usedLimit: 200,
    usedLimitBrl: 200,
  } as FinancialAccount;
  const invest1: FinancialAccount = { ...bank1, id: 4, name: 'NuInvest', type: 'investment' };

  const baseEntry: MonthPlanEntry = {
    id: 10,
    kind: 'expense',
    name: 'Mercado',
    category: 'Geral',
    region: 'BR',
    suggestedAmountBrl: 300,
    status: 'pending',
  };

  function build(entry: MonthPlanEntry, accounts: FinancialAccount[] = [], amount: number | null = null): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ConfirmAccountDialogComponent] }).compileComponents();
    fixture = TestBed.createComponent(ConfirmAccountDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('entry', entry);
    fixture.componentRef.setInput('accounts', accounts);
    fixture.componentRef.setInput('amount', amount);
    fixture.detectChanges();
  }

  it('seeds the edit form from the entry amount and currency', () => {
    build({ ...baseEntry, currency: 'EUR' });
    expect(component.editAmount()).toBe(300);
    expect(component.editCurrency()).toBe('EUR');
    expect(component.editAmountIn()).toBe(300);
    expect(component.editKind()).toBe('expense');
  });

  it('prefers the explicit amount input over the entry amount', () => {
    build(baseEntry, [], 999);
    expect(component.editAmount()).toBe(999);
  });

  it('allows editing the kind for a free-standing variable entry', () => {
    build(baseEntry);
    expect(component.canEditKind()).toBeTrue();
  });

  it('locks the kind for recurring or goal-linked entries', () => {
    build({ ...baseEntry, recurringItemId: 5 });
    expect(component.canEditKind()).toBeFalse();
    build({ ...baseEntry, isGoal: true });
    expect(component.canEditKind()).toBeFalse();
  });

  it('sorts and filters accounts by type', () => {
    build(baseEntry, [bank2, bank1, credit1, invest1]);
    expect(component.bankAccounts().map((a) => a.name)).toEqual(['Itaú', 'Nubank']);
    expect(component.paymentAccounts().map((a) => a.name)).toEqual(['Cartão', 'Itaú', 'Nubank']);
    expect(component.investmentAccounts().map((a) => a.name)).toEqual(['NuInvest']);
    expect(component.allAccounts().length).toBe(4);
  });

  it('uses bank accounts for income and payment accounts otherwise as the default options', () => {
    build({ ...baseEntry, kind: 'income' }, [bank1, credit1]);
    expect(component.defaultAccountOptions()).toEqual(component.bankAccounts());
    build({ ...baseEntry, kind: 'expense' }, [bank1, credit1]);
    expect(component.defaultAccountOptions()).toEqual(component.paymentAccounts());
  });

  describe('constructor effect account prefill', () => {
    it('prefills investment destination and source accounts from the entry', () => {
      build(
        { ...baseEntry, kind: 'investment', financialAccountId: 4, sourceFinancialAccountId: 1 },
        [bank1, invest1]
      );
      expect(component.investmentAccountId()).toBe(4);
      expect(component.bankAccountId()).toBe(1);
    });

    it('auto-selects the only bank account for an investment without a source', () => {
      build({ ...baseEntry, kind: 'investment' }, [bank1, invest1]);
      expect(component.bankAccountId()).toBe(1);
    });

    it('does not auto-select when there is more than one bank account', () => {
      build({ ...baseEntry, kind: 'investment' }, [bank1, bank2, invest1]);
      expect(component.bankAccountId()).toBeNull();
    });

    it('prefills transfer source and target accounts from the entry', () => {
      build(
        { ...baseEntry, kind: 'transfer', sourceFinancialAccountId: 1, financialAccountId: 2 },
        [bank1, bank2]
      );
      expect(component.sourceAccountId()).toBe(1);
      expect(component.targetAccountId()).toBe(2);
    });

    it('prefills the bank account for a plain expense/income entry', () => {
      build({ ...baseEntry, sourceFinancialAccountId: 1 }, [bank1]);
      expect(component.bankAccountId()).toBe(1);
    });
  });

  describe('onOutCurrencyOrAmountChange', () => {
    it('mirrors the out amount into the in amount when currencies match', () => {
      build(baseEntry);
      component.editCurrency.set('BRL');
      component.editCurrencyIn.set('BRL');
      component.editAmount.set(500);
      component.onOutCurrencyOrAmountChange();
      expect(component.editAmountIn()).toBe(500);
    });

    it('leaves the in amount untouched when currencies differ', () => {
      build(baseEntry);
      component.editCurrency.set('BRL');
      component.editCurrencyIn.set('USD');
      component.editAmountIn.set(42);
      component.editAmount.set(500);
      component.onOutCurrencyOrAmountChange();
      expect(component.editAmountIn()).toBe(42);
    });
  });

  describe('canSubmit', () => {
    it('requires distinct source/target accounts and positive amounts for transfers', () => {
      build({ ...baseEntry, kind: 'transfer' }, [bank1, bank2]);
      expect(component.canSubmit()).toBeFalse();
      component.sourceAccountId.set(1);
      component.targetAccountId.set(1);
      component.editAmount.set(10);
      component.editAmountIn.set(10);
      expect(component.canSubmit()).toBeFalse();
      component.targetAccountId.set(2);
      expect(component.canSubmit()).toBeTrue();
    });

    it('allows a zero amount only for income', () => {
      build({ ...baseEntry, kind: 'expense' }, [bank1]);
      component.editAmount.set(0);
      component.bankAccountId.set(1);
      expect(component.canSubmit()).toBeFalse();
      build({ ...baseEntry, kind: 'income' }, [bank1]);
      component.editAmount.set(0);
      component.bankAccountId.set(1);
      expect(component.canSubmit()).toBeTrue();
    });

    it('requires both a bank and an investment account for investments', () => {
      build({ ...baseEntry, kind: 'investment' }, [bank1, bank2, invest1]);
      component.editAmount.set(100);
      expect(component.canSubmit()).toBeFalse();
      component.bankAccountId.set(1);
      expect(component.canSubmit()).toBeFalse();
      component.investmentAccountId.set(4);
      expect(component.canSubmit()).toBeTrue();
    });

    it('requires a bank account for a plain expense', () => {
      build({ ...baseEntry, kind: 'expense' }, [bank1]);
      component.editAmount.set(100);
      expect(component.canSubmit()).toBeFalse();
      component.bankAccountId.set(1);
      expect(component.canSubmit()).toBeTrue();
    });
  });

  describe('submit', () => {
    it('emits a transfer result', () => {
      build({ ...baseEntry, kind: 'transfer' }, [bank1, bank2]);
      component.sourceAccountId.set(1);
      component.targetAccountId.set(2);
      component.editAmount.set(50);
      component.editAmountIn.set(50);
      const spy = jasmine.createSpy('confirmed');
      component.confirmed.subscribe(spy);
      component.submit();
      expect(spy).toHaveBeenCalledWith(
        jasmine.objectContaining({ accountId: 1, targetAccountId: 2, kind: 'transfer' } as Partial<ConfirmAccountResult>)
      );
    });

    it('does not emit a transfer without both accounts', () => {
      build({ ...baseEntry, kind: 'transfer' }, [bank1]);
      const spy = jasmine.createSpy('confirmed');
      component.confirmed.subscribe(spy);
      component.submit();
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not emit without a bank account for non-transfer kinds', () => {
      build({ ...baseEntry, kind: 'expense' }, []);
      const spy = jasmine.createSpy('confirmed');
      component.confirmed.subscribe(spy);
      component.submit();
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits an investment result with the target investment account', () => {
      build({ ...baseEntry, kind: 'investment' }, [bank1, invest1]);
      component.bankAccountId.set(1);
      component.investmentAccountId.set(4);
      const spy = jasmine.createSpy('confirmed');
      component.confirmed.subscribe(spy);
      component.submit();
      expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({ accountId: 1, targetAccountId: 4, kind: 'investment' }));
    });

    it('does not emit an investment without a target account', () => {
      build({ ...baseEntry, kind: 'investment' }, [bank1]);
      component.bankAccountId.set(1);
      const spy = jasmine.createSpy('confirmed');
      component.confirmed.subscribe(spy);
      component.submit();
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits a plain result for expense/income', () => {
      build({ ...baseEntry, kind: 'expense' }, [bank1]);
      component.bankAccountId.set(1);
      const spy = jasmine.createSpy('confirmed');
      component.confirmed.subscribe(spy);
      component.submit();
      expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({ accountId: 1, kind: 'expense' }));
    });
  });

  describe('accountBalanceLabel', () => {
    it('shows the used-limit label for credit accounts', () => {
      build(baseEntry);
      expect(component.accountBalanceLabel(credit1)).toContain('usado');
    });

    it('falls back to the positive balance when usedLimit is absent', () => {
      build(baseEntry);
      const acc = { ...credit1, usedLimit: undefined, usedLimitBrl: undefined, balance: 150, balanceBrl: 150 };
      expect(component.accountBalanceLabel(acc)).toContain('usado');
    });

    it('shows the plain balance for non-credit accounts', () => {
      build(baseEntry);
      const label = component.accountBalanceLabel(bank1);
      expect(label).not.toContain('usado');
    });
  });
});
