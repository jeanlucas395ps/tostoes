import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HomePage } from './home.page';
import { environment } from '../../../environments/environment';
import { DashboardSummary } from '../../core/models/api.models';

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;
  let component: HomePage;
  let http: HttpTestingController;
  const base = environment.apiUrl;

  const dashboard: DashboardSummary = {
    year: 2026,
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: `Mês ${i + 1}`,
      real: { income: 1000, expense: 400, investment: 0, goals: 0, leisure: 0 },
      projected: { income: 1000, expense: 400, investment: 0, goals: 0, leisure: 0 },
      balanceReal: 600,
      balanceProjected: 600,
    })),
    yearTotals: {
      real: { income: 12000, expense: 4800, investment: 0, goals: 0, leisure: 0 },
      projected: { income: 12000, expense: 4800, investment: 0, goals: 0, leisure: 0 },
      balanceReal: 7200,
    },
    investmentTypes: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage, HttpClientTestingModule],
    })
      .overrideComponent(HomePage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushBoot(): void {
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(dashboard);
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: component.month() + 1 });
  }

  it('starts with the planning manager closed', () => {
    fixture.detectChanges();
    flushBoot();
    expect(component.showPlanningManager()).toBeFalse();
  });

  it('loads dashboard, accounts summary and goals on init', () => {
    fixture.detectChanges();
    flushBoot();
    expect(component.data()?.year).toBe(2026);
    expect(component.loading()).toBeFalse();
  });

  it('reloads the dashboard when the year changes', () => {
    fixture.detectChanges();
    flushBoot();
    component.onYearChange(2027);
    expect(component.year()).toBe(2027);
    http.expectOne((r) => r.url === `${base}/dashboard/summary` && r.params.get('year') === '2027').flush({
      ...dashboard,
      year: 2027,
    });
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2027, month: component.month() + 1 });
  });

  it('builds the income/expense bar heights from dashboard months', () => {
    fixture.detectChanges();
    flushBoot();
    const fd = component.flowData();
    expect(fd?.months.length).toBe(12);
    expect(fd?.months[0].incomeVal).toBe(1000);
  });

  it('zeroes bar heights for months before the planning started', () => {
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({
      ...dashboard,
      months: dashboard.months.map((m, i) => (i === 0 ? { ...m, beforePlanningStart: true } : m)),
    });
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: 1 });
    const fd = component.flowData();
    expect(fd?.months[0].inactive).toBeTrue();
    expect(fd?.months[0].incomeH).toBe(0);
  });

  it('is null before the dashboard has loaded', () => {
    fixture.detectChanges();
    expect(component.flowData()).toBeNull();
    expect(component.selectedMonth()).toBeNull();
    flushBoot();
  });

  it('falls back to a synthetic month when the dashboard omits the selected month', () => {
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({ ...dashboard, months: [] });
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: component.month() + 1 });
    const m = component.selectedMonth();
    expect(m?.balanceReal).toBe(0);
    expect(m?.month).toBe(component.month() + 1);
  });

  it('shows the projected flag only for the current/future months', () => {
    fixture.detectChanges();
    flushBoot();
    const now = new Date();
    component.year.set(now.getFullYear());
    component.month.set(now.getMonth());
    expect(component.showProjected()).toBeTrue();
  });

  describe('donutData', () => {
    it('is null when there is no income for the month', () => {
      fixture.detectChanges();
      http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({
        ...dashboard,
        months: dashboard.months.map((m) => ({ ...m, real: { ...m.real, income: 0 } })),
      });
      http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
      http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: 1 });
      expect(component.donutData()).toBeNull();
    });

    it('builds slices with the surplus for an income-positive month', () => {
      fixture.detectChanges();
      flushBoot();
      const donut = component.donutData();
      expect(donut).not.toBeNull();
      expect(donut?.income).toBe(1000);
      expect(donut?.balance).toBe(600);
    });
  });

  describe('goalsChart', () => {
    it('is null when there are no goals with remaining amount', () => {
      fixture.detectChanges();
      http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(dashboard);
      http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
      http.expectOne((r) => r.url === `${base}/goals`).flush({
        items: [{ id: 1, name: 'Feito', targetAmountBrl: 100, currentAmountBrl: 100, remainingAmountBrl: 0 } as never],
        year: 2026,
        month: 1,
      });
      expect(component.goalsChart()).toBeNull();
    });

    it('lists goals that still have a remaining amount', () => {
      fixture.detectChanges();
      http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(dashboard);
      http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
      http.expectOne((r) => r.url === `${base}/goals`).flush({
        items: [{ id: 1, name: 'Viagem', targetAmountBrl: 1000, currentAmountBrl: 200, pct: 20, color: '#000' } as never],
        year: 2026,
        month: 1,
      });
      const chart = component.goalsChart();
      expect(chart?.items.length).toBe(1);
      expect(chart?.items[0].name).toBe('Viagem');
    });
  });

  it('onRefresh reloads and completes the refresher', () => {
    fixture.detectChanges();
    flushBoot();
    const refresher = { complete: jasmine.createSpy('complete') } as unknown as HTMLIonRefresherElement;
    component.onRefresh({ target: refresher } as unknown as CustomEvent);
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(dashboard);
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: component.month() + 1 });
    expect(refresher.complete).toHaveBeenCalled();
  });

  it('clears loading and the accounts summary on request errors', () => {
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({}, { status: 500, statusText: 'Server Error' });
    http.expectOne(`${base}/accounts/summary`).flush({}, { status: 500, statusText: 'Server Error' });
    http.expectOne((r) => r.url === `${base}/goals`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.loading()).toBeFalse();
    expect(component.accountsSummary()).toBeNull();
    expect(component.goals()).toEqual([]);
  });

  it('reloads goals when the month changes', () => {
    fixture.detectChanges();
    flushBoot();
    component.onMonthChange(4);
    expect(component.month()).toBe(4);
    http.expectOne((r) => r.url === `${base}/goals` && r.params.get('month') === '5').flush({
      items: [],
      year: 2026,
      month: 5,
    });
  });

  describe('ensureMonthWithinPlanningUsage', () => {
    it('does nothing without a planningUsageStart', () => {
      fixture.detectChanges();
      flushBoot();
      expect(component.month()).toBe(new Date().getMonth());
    });

    it('jumps to the planning start month within the same year', () => {
      fixture.detectChanges();
      component.year.set(2026);
      component.month.set(2);
      http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({
        ...dashboard,
        planningUsageStart: { year: 2026, month: 6, date: '2026-06-01' },
      });
      http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
      http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2026, month: 3 });
      expect(component.month()).toBe(5);
    });

    it('jumps to the planning start year and reloads when browsing an earlier year', () => {
      fixture.detectChanges();
      component.year.set(2024);
      http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush({
        ...dashboard,
        planningUsageStart: { year: 2026, month: 6, date: '2026-06-01' },
      });
      expect(component.year()).toBe(2026);
      expect(component.month()).toBe(5);

      // The dashboard response synchronously triggers a reload for the corrected
      // year, so both the original (2024) and new (2026) requests are in flight.
      for (const req of http.match((r) => r.url === `${base}/accounts/summary`)) {
        req.flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
      }
      for (const req of http.match((r) => r.url === `${base}/goals`)) {
        req.flush({ items: [], year: 2026, month: 6 });
      }
      http.expectOne((r) => r.url === `${base}/dashboard/summary` && r.params.get('year') === '2026').flush({
        ...dashboard,
        planningUsageStart: { year: 2026, month: 6, date: '2026-06-01' },
      });
    });
  });

  it('clamps the month when switching to a year before the planning usage start', () => {
    fixture.detectChanges();
    flushBoot();
    component.data.update((d) => (d ? { ...d, planningUsageStart: { year: 2026, month: 6, date: '2026-06-01' } } : d));
    component.onYearChange(2025);
    expect(component.year()).toBe(2025);
    http.expectOne((r) => r.url === `${base}/dashboard/summary` && r.params.get('year') === '2025').flush(dashboard);
    http.expectOne(`${base}/accounts/summary`).flush({ accounts: [], totals: { bank: 0, investment: 0, all: 0 } });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: 2025, month: component.month() + 1 });
  });
});
