import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AccountsComponent } from './accounts.component';
import { environment } from '../../../environments/environment';
import { FinancialAccount } from '../../core/models/api.models';

describe('AccountsComponent', () => {
  let fixture: ComponentFixture<AccountsComponent>;
  let component: AccountsComponent;
  let http: HttpTestingController;
  let confirmSpy: jasmine.Spy;
  const base = environment.apiUrl;

  function account(over: Partial<FinancialAccount> = {}): FinancialAccount {
    return {
      id: 1,
      name: 'Nubank',
      type: 'bank',
      currency: 'BRL',
      initialBalance: 100,
      initialBalanceDate: '2026-01-01',
      sortOrder: 0,
      balance: 80,
      balanceBrl: 80,
      ...over,
    } as FinancialAccount;
  }

  function flushSummary(accounts: FinancialAccount[] = [account()]): void {
    http.expectOne(`${base}/accounts/summary`).flush({
      accounts,
      totals: { bank: 80, investment: 0, creditUsed: 10, all: 70 },
    });
  }

  beforeEach(() => {
    confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    TestBed.configureTestingModule({
      imports: [AccountsComponent, HttpClientTestingModule],
    })
      .overrideComponent(AccountsComponent, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(AccountsComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${base}/settings`).flush({ eurToBrlFallback: 6.2, usdToBrl: 5.1 });
    flushSummary([
      account(),
      account({ id: 2, type: 'credit', name: 'Visa', currency: 'EUR', balance: 40, balanceBrl: 240, usedLimit: 50, usedLimitBrl: 300, availableLimit: 1000, creditLimit: 2000, initialBalance: 0, initialBalanceBrl: undefined }),
      account({ id: 3, type: 'investment', name: 'Tesouro', currency: 'USD' }),
    ]);
  });

  afterEach(() => http.verify());

  it('labels balances, statement lines and account types', () => {
    const bank = component.bankAccounts()[0];
    const card = component.creditAccounts()[0];
    const inv = component.investmentAccounts()[0];
    expect(component.accountBalanceLabel(bank)).toContain('R$');
    expect(component.accountBalanceLabel(card)).toContain('R$');
    expect(component.postedDebtLabel(card)).toContain('R$');
    expect(component.accountInitialLabel(card)).toContain('€');
    expect(component.availableLabel(card)).toContain('R$');
    expect(component.availableLabel(bank)).toBe(', ');
    expect(component.limitLabel(card)).toContain('R$');
    expect(component.limitLabel(bank)).toBe(', ');
    expect(component.fxRateFor('USD')).toBe(5.1);
    expect(component.fxRateFor('EUR')).toBe(6.2);
    expect(component.lineAmountLabel({ amount: 10, currency: 'BRL' }, bank)).toContain('R$');
    expect(component.lineAmountLabel({ amount: 10, amountBrl: 60, currency: 'EUR' }, card)).toContain('R$');
    expect(component.lineSignedLabel({ signedAmount: 0 }, bank)).toBe(', ');
    expect(component.lineSignedLabel({ signedAmount: -4 }, bank)).toContain('−');
    expect(component.lineSignedLabel({ signedAmount: 3, signedAmountBrl: 18 }, card)).toContain('+');
    expect(component.lineBalanceLabel({ balanceAfter: 8 }, bank)).toContain('R$');
    expect(component.lineBalanceLabel({ balanceAfter: 8, balanceAfterBrl: 48 }, card)).toContain('R$');
    component.form.currency = 'USD';
    component.form.initialBalance = 2;
    expect(component.formInitialBrlPreview()).toBeGreaterThan(0);
    expect(component.typeLabel('investment')).toBe('Investimento');
    expect(component.typeLabel('credit')).toBe('Cartão de crédito');
    expect(component.typeLabel('bank')).toBe('Banco');
    expect(component.lineKindLabel('opening', true)).toBe('Dívida inicial');
    expect(component.lineKindLabel('opening')).toBe('Saldo inicial');
    expect(component.lineKindLabel('income', true)).toContain('Pagamento');
    expect(component.lineKindLabel('income')).toBe('Entrada');
    expect(component.lineKindLabel('investment')).toBe('Aporte');
    expect(component.lineKindLabel('transfer')).toBe('Transferência');
    expect(component.lineKindLabel('expense', true)).toBe('Compra');
    expect(component.lineKindLabel('expense')).toBe('Saída');
    expect(component.stmtFiltersActive()).toBeFalse();
    expect(inv.type).toBe('investment');
  });

  it('loads a statement, filters, and saves credit and investment accounts', () => {
    component.selectAccount(account({ id: 1 }));
    http.expectOne((r) => r.url === `${base}/accounts/1`).flush({ item: account({ id: 1, statement: [] }) });
    expect(component.statement()?.id).toBe(1);

    component.stmtKindFilter.set('expense');
    component.stmtSearch.set(' nuba ');
    expect(component.stmtFiltersActive()).toBeTrue();
    component.applyStatementFilters();
    const filtered = http.expectOne((r) => r.url === `${base}/accounts/1`);
    expect(filtered.request.params.get('kind')).toBe('expense');
    expect(filtered.request.params.get('search')).toBe('nuba');
    filtered.flush({ item: account({ id: 1 }) });
    component.clearStatementFilters();
    http.expectOne((r) => r.url === `${base}/accounts/1`).flush({ item: account({ id: 1 }) });
    expect(component.stmtSearch()).toBe('');

    component.onYearChange(2025);
    http.expectOne((r) => r.url === `${base}/accounts/1`).flush({ item: account() });
    component.onMonthChange(1);
    http.expectOne((r) => r.url === `${base}/accounts/1`).flush({ item: account() });
    component.selectedId.set(null);
    component.onYearChange(2024);
    component.applyStatementFilters();

    component.openNew('credit');
    expect(component.form.creditLimit).toBe(5000);
    component.openNew('investment');
    expect(component.form.color).toBe('#a371f7');
    component.form.name = '  ';
    component.save();
    http.expectNone((r) => r.method === 'POST');
    component.form.name = 'Corretora';
    component.form.cdiMonthlyRate = 0.01;
    component.save();
    const created = http.expectOne((r) => r.method === 'POST' && r.url === `${base}/accounts`);
    expect(created.request.body.cdiMonthlyRate).toBe(0.01);
    expect(created.request.body.creditLimit).toBeNull();
    created.flush({ item: account({ id: 9, type: 'investment' }) });
    http.expectOne(`${base}/accounts/summary`).flush({
      accounts: [account()],
      totals: { bank: 80, investment: 0, all: 80 },
    });
    for (const req of http.match((r) => r.url === `${base}/accounts/9`)) {
      req.flush({ item: account({ id: 9 }) });
    }

    component.openEdit(account({ id: 2, type: 'credit', name: 'Visa', creditLimit: 3000, closingDay: 3, dueDay: 10, color: '#fff' }));
    component.form.name = 'Visa Gold';
    component.save();
    http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/accounts/2`).flush({ item: account({ id: 2 }) });
    http.expectOne(`${base}/accounts/summary`).flush({
      accounts: [account()],
      totals: { bank: 80, investment: 0, all: 80 },
    });
    for (const req of http.match((r) => r.url === `${base}/accounts/2`)) {
      req.flush({ item: account({ id: 2 }) });
    }
    component.cancelForm();
    expect(component.showForm()).toBeFalse();

    confirmSpy.and.returnValue(false);
    component.remove(account({ id: 2, type: 'credit', name: 'Visa' }));
    http.expectNone((r) => r.method === 'DELETE');
    confirmSpy.and.returnValue(true);
    component.selectedId.set(2);
    component.remove(account({ id: 2, type: 'credit', name: 'Visa' }));
    http.expectOne((r) => r.method === 'DELETE' && r.url === `${base}/accounts/2`).flush({ ok: true });
    flushSummary();
    expect(component.selectedId()).toBeNull();
    component.remove(account({ id: 1, type: 'bank', name: 'Nubank' }));
    http.expectOne((r) => r.method === 'DELETE' && r.url === `${base}/accounts/1`).flush({ ok: true });
    flushSummary();
  });

  it('reloads the open statement with the summary and survives a summary error', () => {
    component.selectedId.set(1);
    component.loadSummary();
    flushSummary();
    http.expectOne((r) => r.url === `${base}/accounts/1`).flush({ item: account() });
    component.loadSummary();
    http.expectOne(`${base}/accounts/summary`).flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.loading()).toBeFalse();
    component.ngOnInit();
    http.expectOne(`${base}/settings`).flush({ eurToBrl: 7 });
    flushSummary();
    http.expectOne((r) => r.url === `${base}/accounts/1`).flush({ item: account() });
    expect(component.eurToBrl()).toBe(7);
  });
});
