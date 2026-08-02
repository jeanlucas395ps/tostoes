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
});
