import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { FinanceApiService } from './finance-api.service';
import { environment } from '../../../environments/environment';

describe('FinanceApiService', () => {
  let api: FinanceApiService;
  let http: HttpTestingController;
  const base = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FinanceApiService],
    });
    api = TestBed.inject(FinanceApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAccounts without type', () => {
    api.getAccounts().subscribe((r) => expect(r.items.length).toBe(1));
    const req = http.expectOne(`${base}/accounts`);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [{ id: 1, name: 'Banco', type: 'bank' }] });
  });

  it('getAccounts filters by credit type', () => {
    api.getAccounts('credit').subscribe((r) => {
      expect(r.items[0].type).toBe('credit');
    });
    const req = http.expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'credit');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [{ id: 2, name: 'Nubank', type: 'credit' }] });
  });

  it('saveAccount posts new credit card', () => {
    api
      .saveAccount({
        name: 'Visa',
        type: 'credit',
        creditLimit: 5000,
        dueDay: 10,
        closingDay: 1,
        currency: 'BRL',
        initialBalance: 0,
      })
      .subscribe((r) => expect(r.item.type).toBe('credit'));
    const req = http.expectOne(`${base}/accounts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.type).toBe('credit');
    expect(req.request.body.creditLimit).toBe(5000);
    req.flush({ item: { id: 9, name: 'Visa', type: 'credit' } });
  });

  it('saveAccount puts when id given', () => {
    api.saveAccount({ name: 'Visa 2' }, 9).subscribe();
    const req = http.expectOne(`${base}/accounts/9`);
    expect(req.request.method).toBe('PUT');
    req.flush({ item: { id: 9, name: 'Visa 2' } });
  });

  it('saveRecurringItem posts installment with source card', () => {
    api
      .saveRecurringItem({
        kind: 'expense',
        name: 'Notebook',
        amount: 299,
        currency: 'BRL',
        dueDay: 10,
        isInstallment: true,
        startDate: '2026-07-01',
        endDate: '2026-12-01',
        sourceFinancialAccountId: 30,
        category: 'Geral',
        region: 'geral',
      })
      .subscribe((r) => expect(r.item.isInstallment).toBeTrue());
    const req = http.expectOne(`${base}/recurring-items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.isInstallment).toBeTrue();
    expect(req.request.body.sourceFinancialAccountId).toBe(30);
    req.flush({ item: { id: 1, isInstallment: true } });
  });

  it('getAccountFlowGraph passes mode year month', () => {
    api.getAccountFlowGraph(2026, 7, 'planned').subscribe((g) => {
      expect(g.mode).toBe('planned');
    });
    const req = http.expectOne(
      (r) =>
        r.url === `${base}/accounts/flow-graph` &&
        r.params.get('year') === '2026' &&
        r.params.get('month') === '7' &&
        r.params.get('mode') === 'planned'
    );
    req.flush({ year: 2026, month: 7, mode: 'planned', nodes: [], edges: [] });
  });

  it('getLedger returns creditBills', () => {
    api.getLedger(2026, 7).subscribe((L) => {
      expect(L.creditBills?.length).toBe(1);
    });
    const req = http.expectOne(
      (r) => r.url === `${base}/ledger` && r.params.get('year') === '2026'
    );
    req.flush({
      year: 2026,
      month: 7,
      pending: [],
      confirmed: [],
      creditBills: [{ accountId: 1, name: 'Nubank', forecast: { pendingBrl: 10, confirmedBrl: 0, totalBrl: 10 }, paidBrl: 0, remainingBrl: 10, items: [] }],
      summary: {},
    });
  });
});
