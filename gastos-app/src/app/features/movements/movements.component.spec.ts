import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MovementsComponent } from './movements.component';
import { environment } from '../../../environments/environment';
import { CreditBill, CreditBillItem, FinancialAccount, LedgerView } from '../../core/models/api.models';

describe('MovementsComponent (credit bill advance)', () => {
  let fixture: ComponentFixture<MovementsComponent>;
  let component: MovementsComponent;
  let http: HttpTestingController;
  const base = environment.apiUrl;
  let alertSpy: jasmine.Spy;

  const bill: CreditBill = {
    accountId: 7,
    name: 'Nubank',
    forecast: { pendingBrl: 100, confirmedBrl: 0, totalBrl: 100 },
    paidBrl: 0,
    remainingBrl: 100,
    items: [
      {
        id: 1,
        name: 'TesteParcela',
        amountBrl: 100,
        isInstallment: true,
        status: 'pending',
      } as CreditBillItem,
    ],
  };

  function flushBoot(): void {
    http.expectOne(`${base}/settings`).flush({ eurToBrlFallback: 6.1, usdToBrlFallback: 5.1 });
    http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [] });
    http.expectOne(`${base}/investment-types`).flush({ items: [] });
    http.expectOne(`${base}/auth/users`).flush({ items: [] });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({});
    http.expectOne((r) => r.url === `${base}/ledger`).flush({
      year: 2026,
      month: 8,
      pending: [],
      confirmed: [],
      creditBills: [bill],
      summary: {
        incomeTotal: 0,
        expenseTotal: 0,
        balance: 0,
        pendingCount: 0,
        confirmedCount: 0,
        projected: { income: 0, expense: 0, balance: 0 },
      },
    } as LedgerView);
  }

  beforeEach(() => {
    alertSpy = spyOn(window, 'alert');
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

  it('exposes credit bills from the ledger', () => {
    expect(component.creditBills().length).toBe(1);
    expect(component.creditBills()[0].name).toBe('Nubank');
  });

  it('openPayBill prefills bank and amount', () => {
    component.openPayBill(bill);
    http.expectOne((r) => r.url === `${base}/accounts`).flush({
      items: [
        { id: 4, type: 'bank' } as FinancialAccount,
        { id: 5, type: 'investment' } as FinancialAccount,
      ],
    });
    expect(component.payBillBankId()).toBe(4);
    expect(component.payBillAmount()).toBe(100);
    expect(component.payBillPrompt()).toEqual(bill);
  });

  it('togglePayBillItem updates the amount from selected installment names', () => {
    component.payBillPrompt.set(bill);
    component.togglePayBillItem(1);
    expect(component.isPayBillItemSelected(1)).toBeTrue();
    expect(component.payBillAmount()).toBe(100);
  });

  it('submitPayBill posts advance-payment with selected item names', () => {
    component.payBillPrompt.set(bill);
    component.payBillBankId.set(4);
    component.payBillAmount.set(100);
    component.payBillDate.set('2026-08-15');
    component.payBillSelectedIds.set(new Set([1]));
    component.submitPayBill();
    const req = http.expectOne(
      (r) => r.url === `${base}/accounts/7/advance-payment` && r.method === 'POST'
    );
    expect(req.request.body).toEqual(
      jasmine.objectContaining({
        sourceAccountId: 4,
        amount: 100,
        transactionDate: '2026-08-15',
        itemNames: ['TesteParcela'],
      })
    );
    req.flush({ ok: true, outTransactionId: 1, inTransactionId: 2, description: 'x' });
    http.expectOne((r) => r.url === `${base}/ledger`).flush({
      year: 2026,
      month: 8,
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
    } as LedgerView);
    expect(component.payBillPrompt()).toBeNull();
  });

  it('submitPayBill alerts on error', () => {
    component.payBillPrompt.set(bill);
    component.payBillBankId.set(4);
    component.payBillAmount.set(100);
    component.submitPayBill();
    http
      .expectOne((r) => r.url.includes('/advance-payment'))
      .flush({ error: 'falhou' }, { status: 422, statusText: 'Unprocessable' });
    expect(alertSpy).toHaveBeenCalled();
  });
});
