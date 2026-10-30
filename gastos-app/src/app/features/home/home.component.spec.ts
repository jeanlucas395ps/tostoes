import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HomeComponent } from './home.component';
import { environment } from '../../../environments/environment';
import {
  DashboardSummary,
  FinancialAccount,
  FinancialGoal,
  MonthSummary,
} from '../../core/models/api.models';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let component: HomeComponent;
  let http: HttpTestingController;
  const base = environment.apiUrl;

  function month(n: number, over: Partial<MonthSummary> = {}): MonthSummary {
    const zero = { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 };
    return {
      month: n,
      label: `Mês ${n}`,
      real: { ...zero },
      projected: { ...zero },
      balanceReal: 0,
      balanceProjected: 0,
      ...over,
    };
  }

  function dash(over: Partial<DashboardSummary> = {}): DashboardSummary {
    return {
      year: 2026,
      months: [month(10, { real: { income: 1000, expense: 200, investment: 100, goals: 50, leisure: 50 }, projected: { income: 1100, expense: 300, investment: 80, goals: 40, leisure: 20 }, balanceReal: 600, balanceProjected: 660, label: 'Outubro' })],
      yearTotals: {
        real: { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 },
        projected: { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 },
        balanceReal: 0,
      },
      investmentTypes: [],
      ...over,
    };
  }

  function goal(over: Partial<FinancialGoal> = {}): FinancialGoal {
    return {
      id: 1,
      name: 'Reserva de emergência longa',
      color: '#00AB55',
      targetAmountBrl: 1000,
      currentAmountBrl: 100,
      confirmedContributionsBrl: 100,
      plannedAmountBrl: 200,
      monthlyAmountBrl: 50,
      projectedMonthBrl: 50,
      monthCount: 12,
      dueDay: 5,
      plannedPct: 20,
      confirmedBarPct: 10,
      pct: 10,
      ...over,
    } as FinancialGoal;
  }

  function flushLoad(body: DashboardSummary = dash(), goals: FinancialGoal[] = []): void {
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(body);
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 1, investment: 2, all: 3 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: goals, year: 2026, month: 10 });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomeComponent, HttpClientTestingModule],
    })
      .overrideComponent(HomeComponent, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('builds charts, goals and month fallbacks', () => {
    component.year.set(2026);
    component.month.set(9);
    fixture.detectChanges();
    const inactive = month(1, { beforePlanningStart: true, label: 'Janeiro' });
    const rich = month(10, {
      label: 'Outubro',
      real: { income: 1000, expense: 400, investment: 100, goals: 50, leisure: 50 },
      projected: { income: 1200, expense: 300, investment: 80, goals: 20, leisure: 10 },
      balanceReal: 400,
      balanceProjected: 790,
    });
    flushLoad(dash({ months: [inactive, rich], planningUsageStart: { year: 2026, month: 10, date: '2026-10-01' } }), [
      goal({ id: 1, targetFinancialAccountId: 5, destinationBalanceBrl: 80, currentAmountBrl: 10, startDate: '2026-01-03', endDate: '2027-06-01' }),
      goal({ id: 2, targetFinancialAccountId: 5, destinationBalanceBrl: 80, currentAmountBrl: 10, name: 'Curta' }),
      goal({ id: 3, targetFinancialAccountId: null, currentAmountBrl: 30, remainingAmountBrl: 10 }),
      goal({ id: 4, remainingAmountBrl: 0, currentAmountBrl: 100, targetAmountBrl: 100, projectedMonthBrl: 0 }),
    ]);
    expect(component.loading()).toBeFalse();
    expect(component.accountsSummary()?.totals.all).toBe(3);
    expect(component.selectedMonth()?.month).toBe(10);
    expect(component.monthNavPills().length).toBe(2);
    expect(component.flowData()?.months[0].inactive).toBeTrue();
    expect(component.flowData()?.months[1].expenseH).toBeGreaterThan(0);
    expect(component.donutData()?.slicesCoverIncome).toBeTrue();
    expect(component.gastosReal(rich)).toBe(450);
    expect(component.gastosProjected(rich)).toBe(310);
    expect(component.operacionalProjected(rich)).toBe(890);
    expect(component.investMetasReal(rich)).toBe(150);
    expect(component.investMetasProjected(rich)).toBe(100);
    expect(component.confirmedGoalsTotal(component.goals())).toBe(210);
    const chart = component.goalsChart();
    expect(chart?.items.length).toBe(3);
    expect(chart?.items[0].name.endsWith('…')).toBeTrue();
    expect(chart?.items[0].startDate).toContain('2026');
    expect(component.detailTableShowReal()).toBeTrue();
    component.detailTableView.set('projected');
    expect(component.detailTableShowReal()).toBeFalse();
    expect(component.detailTableShowProjected()).toBeTrue();
    component.detailTableView.set('real');
    expect(component.detailTableShowProjected()).toBeFalse();
    expect(component.formatBrlOrDash(10, true)).toBe(', ');
    expect(component.formatBrlOrDash(10, false)).toContain('R$');
    expect(component.accountTypeIcon('credit')).toContain('svg');
    expect(component.accountTypeIcon('investment')).toContain('svg');
    expect(component.accountTypeIcon('bank')).toContain('svg');
    const acc = { balance: 10, currency: 'EUR', balanceBrl: 60 } as FinancialAccount;
    expect(component.accountEurBalance(acc)).toContain('€');
    expect(component.accountForeignBalance({ ...acc, currency: 'USD' })).toContain('US$');
    expect(component.isForeignCurrency('EUR')).toBeTrue();

    component.month.set(0);
    expect(component.selectedMonth()?.month).toBe(1);
    expect(component.selectedMonth()?.balanceReal).toBe(0);

    component.onMonthChange(8);
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: 9 });
    expect(component.month()).toBe(8);
  });

  it('redraws a deficit donut and clamps the year to planning start', () => {
    component.year.set(2024);
    component.month.set(0);
    fixture.detectChanges();
    const deficit = month(1, {
      label: 'Janeiro',
      real: { income: 100, expense: 180, investment: 0, goals: 0, leisure: 0 },
      projected: { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 },
    });
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(
      dash({ months: [deficit], planningUsageStart: { year: 2026, month: 6, date: '2026-06-01' } })
    );
    for (const req of http.match(() => true)) {
      const url = req.request.url;
      if (url.includes('/accounts/summary')) {
        req.flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
      } else if (url.includes('/goals')) {
        req.flush({ items: [], year: 2026, month: 6 });
      } else {
        req.flush(dash());
      }
    }
    expect(component.year()).toBe(2026);
    expect(component.month()).toBe(5);

    component.data.set(dash({ months: [deficit] }));
    component.month.set(0);
    const donut = component.donutData();
    expect(donut?.balance).toBeLessThan(0);
    expect(donut?.legend.some((s) => s.label === 'Sobra' && s.value < 0)).toBeTrue();
    component.month.set(0);
    component.data.set(
      dash({
        months: [
          month(1, {
            real: { income: 1000, expense: 990, investment: 10, goals: 0, leisure: 0 },
            projected: { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 },
          }),
        ],
      })
    );
    expect(component.donutData()?.paths.some((p) => p.label === 'Investimentos')).toBeFalse();
    component.data.set(dash({ months: [month(1, { real: { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 }, projected: { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 } })] }));
    expect(component.donutData()).toBeNull();
    component.data.set(null);
    expect(component.flowData()).toBeNull();
    expect(component.monthNavPills()).toEqual([]);
    expect(component.goalsChart()).toBeNull();
    expect(component.selectedMonth()).toBeNull();

    component.data.set(dash({ planningUsageStart: { year: 2026, month: 6, date: '2026-06-01' } }));
    component.year.set(2026);
    component.month.set(0);
    component.onYearChange(2026);
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(dash({ planningUsageStart: { year: 2026, month: 6, date: '2026-06-01' }, months: [month(6)] }));
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: 6 });
    expect(component.month()).toBeGreaterThanOrEqual(0);
  });

  it('same-year usage start only moves the month, and errors clear loading', () => {
    component.year.set(2026);
    component.month.set(0);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(
      dash({ planningUsageStart: { year: 2026, month: 4, date: '2026-04-01' }, months: [month(4)] })
    );
    http
      .expectOne(`${base}/accounts/summary`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    http
      .expectOne((r) => r.url === `${base}/goals`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.month()).toBe(3);
    expect(component.accountsSummary()).toBeNull();
    expect(component.goals()).toEqual([]);
    expect(component.loading()).toBeFalse();

    component.load();
    http
      .expectOne((r) => r.url === `${base}/dashboard/summary`)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: 4 });
    expect(component.loading()).toBeFalse();
  });
});
