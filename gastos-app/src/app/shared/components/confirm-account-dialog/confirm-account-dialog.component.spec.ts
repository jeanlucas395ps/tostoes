import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmAccountDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ConfirmAccountDialogComponent);
    cmp = fixture.componentInstance;
    fixture.componentRef.setInput('entry', entry);
    fixture.componentRef.setInput('accounts', [bank, credit]);
    fixture.detectChanges();
  });

  it('lists bank and credit as payment accounts', () => {
    expect(cmp.paymentAccounts().map((a) => a.type).sort()).toEqual(['bank', 'credit']);
  });

  it('lists only banks for income sources', () => {
    expect(cmp.bankAccounts().map((a) => a.id)).toEqual([1]);
  });

  it('requires payment account to submit expense', () => {
    cmp.editKind.set('expense');
    cmp.editAmount.set(50);
    cmp.bankAccountId.set(null);
    expect(cmp.canSubmit()).toBeFalse();
    cmp.bankAccountId.set(2);
    expect(cmp.canSubmit()).toBeTrue();
  });

  it('emits credit accountId on submit', () => {
    const spy = jasmine.createSpy('confirmed');
    cmp.confirmed.subscribe(spy);
    cmp.editKind.set('expense');
    cmp.editAmount.set(50);
    cmp.bankAccountId.set(2);
    cmp.submit();
    expect(spy).toHaveBeenCalled();
    expect(spy.calls.mostRecent().args[0].accountId).toBe(2);
  });

  it('accountTypeShort distinguishes credit', () => {
    expect(cmp.accountTypeShort('credit')).toBe('Cartão');
    expect(cmp.accountTypeShort('bank')).toBe('Banco');
    expect(cmp.accountTypeShort('investment')).toBe('Invest.');
  });
});
