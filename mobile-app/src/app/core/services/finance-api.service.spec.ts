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

  it('covers settings fx dashboard accounts', () => {
    api.getSettings().subscribe();
    http.expectOne(`${base}/settings`).flush({ eurToBrl: 6 });

    api.updateSettings({ eurToBrl: 6.5 }).subscribe();
    const settingsPut = http.expectOne(`${base}/settings`);
    expect(settingsPut.request.method).toBe('PUT');
    settingsPut.flush({ eurToBrl: 6.5 });

    api.getFxRate('2026-07-01').subscribe();
    http
      .expectOne((r) => r.url === `${base}/fx/eur-brl` && r.params.get('date') === '2026-07-01')
      .flush({ rate: 6.2 });

    api.getFxRate('2026-07-01', 'USD').subscribe();
    http
      .expectOne((r) => r.url === `${base}/fx/usd-brl` && r.params.get('date') === '2026-07-01')
      .flush({ rate: 5.1 });

    api.getDashboard(2026).subscribe();
    http
      .expectOne((r) => r.url === `${base}/dashboard/summary` && r.params.get('year') === '2026')
      .flush({});

    api.getAccountsSummary().subscribe();
    http.expectOne(`${base}/accounts/summary`).flush({});

    api.getAccounts().subscribe();
    http.expectOne(`${base}/accounts`).flush({ items: [] });

    api.getAccounts('credit').subscribe();
    http
      .expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'credit')
      .flush({ items: [] });

    api.getAccount(1, 2026, 7, { kind: 'expense', search: ' luz ' }).subscribe();
    http
      .expectOne(
        (r) =>
          r.url === `${base}/accounts/1` &&
          r.params.get('search') === 'luz' &&
          r.params.get('kind') === 'expense'
      )
      .flush({ item: { id: 1 } });

    api.getAccount(2).subscribe();
    http.expectOne(`${base}/accounts/2`).flush({ item: { id: 2 } });

    api.saveAccount({ name: 'A', type: 'credit', creditLimit: 1 }).subscribe();
    const accPost = http.expectOne(`${base}/accounts`);
    expect(accPost.request.method).toBe('POST');
    accPost.flush({ item: { id: 1 } });

    api.saveAccount({ name: 'B' }, 1).subscribe();
    const accPut = http.expectOne(`${base}/accounts/1`);
    expect(accPut.request.method).toBe('PUT');
    accPut.flush({ item: { id: 1 } });

    api.deleteAccount(1).subscribe();
    const accDel = http.expectOne(`${base}/accounts/1`);
    expect(accDel.request.method).toBe('DELETE');
    accDel.flush({ ok: true });
  });

  it('covers transactions goals portfolio projections', () => {
    api.getTransactions(2026, 7).subscribe();
    http.expectOne((r) => r.url === `${base}/transactions`).flush({ items: [] });

    api.getTransactions(2026, 7, 'income').subscribe();
    http
      .expectOne((r) => r.url === `${base}/transactions` && r.params.get('kind') === 'income')
      .flush({ items: [] });

    api.saveTransaction({ kind: 'expense' }).subscribe();
    const txPost = http.expectOne(`${base}/transactions`);
    expect(txPost.request.method).toBe('POST');
    txPost.flush({ item: { id: 1 } });

    api.saveTransaction({ amount: 1 }, 1).subscribe();
    const txPut = http.expectOne(`${base}/transactions/1`);
    expect(txPut.request.method).toBe('PUT');
    txPut.flush({ item: { id: 1 } });

    api.deleteTransaction(1).subscribe();
    http.expectOne(`${base}/transactions/1`).flush({ ok: true });

    api.getInvestmentTypes().subscribe();
    http.expectOne(`${base}/investment-types`).flush({ items: [] });

    api.getGoals(2026).subscribe();
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: 1 });

    api.getGoals(2026, 7).subscribe();
    http
      .expectOne((r) => r.url === `${base}/goals` && r.params.get('month') === '7')
      .flush({ items: [], year: 2026, month: 7 });

    const goal = {
      name: 'M',
      targetAmountBrl: 1,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    };
    api.saveGoal(goal).subscribe();
    const gPost = http.expectOne(`${base}/goals`);
    expect(gPost.request.method).toBe('POST');
    gPost.flush({ item: { id: 1 } });

    api.saveGoal(goal, 1).subscribe();
    const gPut = http.expectOne(`${base}/goals/1`);
    expect(gPut.request.method).toBe('PUT');
    gPut.flush({ item: { id: 1 } });

    api.deleteGoal(1).subscribe();
    http.expectOne(`${base}/goals/1`).flush({ ok: true });

    api.getInvestmentPortfolio(2026, 7).subscribe();
    http.expectOne((r) => r.url === `${base}/investment-types/portfolio`).flush({});

    api.getAccountFlowGraph(2026, 7, 'planned').subscribe();
    http
      .expectOne((r) => r.url === `${base}/accounts/flow-graph` && r.params.get('mode') === 'planned')
      .flush({ mode: 'planned', nodes: [], edges: [] });

    api.getProjections(2026).subscribe();
    http.expectOne((r) => r.url === `${base}/projections`).flush({ items: [] });

    api.getProjections(2026, 'expense').subscribe();
    http
      .expectOne((r) => r.url === `${base}/projections` && r.params.get('kind') === 'expense')
      .flush({ items: [] });

    api.saveProjection({ kind: 'expense' }).subscribe();
    http.expectOne(`${base}/projections`).flush({ ok: true });

    api.deleteProjection(3).subscribe();
    http.expectOne(`${base}/projections/3`).flush({ ok: true });

    api.getHouseholdUsers().subscribe();
    http.expectOne(`${base}/auth/users`).flush({ items: [] });
  });

  it('covers ledger month-plan taxonomy recurring', () => {
    api.getLedger(2026, 7).subscribe((L) => expect(L.creditBills?.length).toBe(1));
    http.expectOne((r) => r.url === `${base}/ledger`).flush({
      pending: [],
      confirmed: [],
      creditBills: [{ accountId: 1 }],
    });

    api.getLedger(2026, 7, 'expense').subscribe();
    http
      .expectOne((r) => r.url === `${base}/ledger` && r.params.get('kinds') === 'expense')
      .flush({ pending: [], confirmed: [] });

    api.getMonthPlan(2026, 7).subscribe();
    http.expectOne((r) => r.url === `${base}/month-plan`).flush({});

    api.regenerateMonthPlan(2026, 7).subscribe();
    http.expectOne((r) => r.url === `${base}/month-plan/regenerate`).flush({});

    api.addMonthPlanEntry({ year: 2026, month: 7, kind: 'expense', name: 'X' }).subscribe();
    http.expectOne(`${base}/month-plan`).flush({});

    api.updateMonthPlanEntry(1, { name: 'Y' }).subscribe();
    http.expectOne(`${base}/month-plan/1`).flush({});

    api.confirmMonthPlanEntry(1).subscribe();
    http.expectOne(`${base}/month-plan/1/confirm`).flush({});

    api.confirmMonthPlanEntry(1, { amount: 10 }).subscribe();
    http.expectOne(`${base}/month-plan/1/confirm`).flush({});

    api.skipMonthPlanEntry(1).subscribe();
    http.expectOne(`${base}/month-plan/1/skip`).flush({});

    api.unconfirmMonthPlanEntry(1).subscribe();
    http.expectOne(`${base}/month-plan/1/unconfirm`).flush({});

    api.deleteMonthPlanEntry(1).subscribe();
    http.expectOne(`${base}/month-plan/1`).flush({ ok: true });

    api.unconfirmTransaction(5).subscribe();
    http.expectOne(`${base}/transactions/5/unconfirm`).flush({ ok: true });

    api.spawnMonthPlanEntry({ year: 2026, month: 7, recurringItemId: 3 }).subscribe();
    http.expectOne(`${base}/month-plan/spawn`).flush({});

    api.getPlanningTaxonomy().subscribe();
    http.expectOne(`${base}/planning-taxonomy`).flush({});

    api.saveCustomTab({ name: 'BR' }).subscribe();
    const tabPost = http.expectOne(`${base}/planning-custom-tabs`);
    expect(tabPost.request.method).toBe('POST');
    tabPost.flush({ item: { id: 1 } });

    api.saveCustomTab({ name: 'BR' }, 1).subscribe();
    const tabPut = http.expectOne(`${base}/planning-custom-tabs/1`);
    expect(tabPut.request.method).toBe('PUT');
    tabPut.flush({ item: { id: 1 } });

    api.deleteCustomTab(1).subscribe();
    http.expectOne(`${base}/planning-custom-tabs/1`).flush({ ok: true });

    api.saveItemCategory({ name: 'Mercado' }).subscribe();
    const catPost = http.expectOne(`${base}/planning-item-categories`);
    expect(catPost.request.method).toBe('POST');
    catPost.flush({ item: { id: 1 } });

    api.saveItemCategory({ name: 'Mercado' }, 1).subscribe();
    const catPut = http.expectOne(`${base}/planning-item-categories/1`);
    expect(catPut.request.method).toBe('PUT');
    catPut.flush({ item: { id: 1 } });

    api.deleteItemCategory(1).subscribe();
    http.expectOne(`${base}/planning-item-categories/1`).flush({ ok: true });

    api.getRecurringItems().subscribe();
    http.expectOne(`${base}/recurring-items`).flush({ items: [] });

    api.getRecurringItems('expense', true).subscribe();
    http
      .expectOne((r) => r.params.get('kind') === 'expense' && r.params.get('installments') === '1')
      .flush({ items: [] });

    api
      .saveRecurringItem({
        kind: 'expense',
        name: 'Notebook',
        amount: 299,
        isInstallment: true,
        startDate: '2026-07-01',
        endDate: '2026-12-01',
        sourceFinancialAccountId: 30,
      })
      .subscribe();
    const riPost = http.expectOne(`${base}/recurring-items`);
    expect(riPost.request.method).toBe('POST');
    expect(riPost.request.body.isInstallment).toBeTrue();
    riPost.flush({ item: { id: 1, isInstallment: true } });

    api.saveRecurringItem({ kind: 'expense', name: 'X' }, 1).subscribe();
    const riPut = http.expectOne(`${base}/recurring-items/1`);
    expect(riPut.request.method).toBe('PUT');
    riPut.flush({ item: { id: 1 } });

    api.deleteRecurringItem(1).subscribe();
    http.expectOne(`${base}/recurring-items/1`).flush({ ok: true });
  });
});
