import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { GoalsComponent } from './goals.component';
import { environment } from '../../../environments/environment';
import { FinancialAccount, FinancialGoal } from '../../core/models/api.models';

describe('GoalsComponent', () => {
  let fixture: ComponentFixture<GoalsComponent>;
  let component: GoalsComponent;
  let http: HttpTestingController;
  let alertSpy: jasmine.Spy;
  let confirmSpy: jasmine.Spy;
  const base = environment.apiUrl;

  function goal(over: Partial<FinancialGoal> = {}): FinancialGoal {
    return {
      id: 4,
      name: 'Casa',
      description: 'entrada',
      color: '#111',
      targetAmountBrl: 10000,
      currentAmountBrl: 1000,
      confirmedContributionsBrl: 1000,
      plannedAmountBrl: 2000,
      monthlyAmountBrl: 100,
      projectedMonthBrl: 100,
      monthCount: 12,
      dueDay: 8,
      startDate: '2026-01-15',
      endDate: '2027-01-15',
      sourceFinancialAccountId: 1,
      targetFinancialAccountId: 2,
      ...over,
    } as FinancialGoal;
  }

  beforeEach(() => {
    alertSpy = spyOn(window, 'alert');
    confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    TestBed.configureTestingModule({
      imports: [GoalsComponent, HttpClientTestingModule],
    })
      .overrideComponent(GoalsComponent, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(GoalsComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'bank').flush({
      items: [{ id: 1, name: 'Banco', type: 'bank', balanceBrl: 10 } as FinancialAccount],
    });
    http.expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'investment').flush({
      items: [{ id: 2, name: 'Tesouro', type: 'investment', balanceBrl: 500 } as FinancialAccount],
    });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [goal()], year: 2026, month: 1 });
  });

  afterEach(() => http.verify());

  it('computes the installment from the destination balance and formats dates', () => {
    expect(component.loading()).toBeFalse();
    component.form.targetFinancialAccountId = 2;
    component.form.targetAmountBrl = 1100;
    component.form.startDate = '2026-01-15';
    component.form.endDate = '2026-03-15';
    expect(component.accountBalanceBrl()).toBe(500);
    expect(component.monthCountFromForm()).toBe(3);
    expect(component.computedMonthly()).toBe(200);
    component.form.targetFinancialAccountId = null;
    component.form.endDate = '2026-01-01';
    component.investmentAccounts.update((list) => [...list]);
    expect(component.accountBalanceBrl()).toBe(0);
    expect(component.monthCountFromForm()).toBe(0);
    expect(component.computedMonthly()).toBe(0);
    expect(component.formatDate(null)).toBe('');
    expect(component.formatDate('ruim')).toBe('ruim');
    expect(component.formatDate('2026-01-15')).toContain('jan.');
    component.openCreate();
    expect(component.showForm()).toBeTrue();
    expect(component.form.dueDay).toBeLessThanOrEqual(28);
  });

  it('validates and saves a new goal and an edit', () => {
    component.openCreate();
    component.form.name = '  ';
    component.save();
    http.expectNone((r) => r.method === 'POST');

    component.form.name = 'Viagem';
    component.form.targetFinancialAccountId = null;
    component.save();
    expect(String(alertSpy.calls.mostRecent().args[0])).toContain('destino');

    component.form.targetFinancialAccountId = 2;
    component.form.targetAmountBrl = 100;
    component.form.startDate = '2026-01-01';
    component.form.endDate = '2026-12-01';
    component.save();
    expect(String(alertSpy.calls.mostRecent().args[0])).toContain('saldo atual');

    component.form.targetAmountBrl = 5000;
    component.form.endDate = '2025-01-01';
    component.save();
    expect(String(alertSpy.calls.mostRecent().args[0])).toContain('período');

    component.form.endDate = '2027-01-01';
    component.form.description = '  praia ';
    component.save();
    const created = http.expectOne((r) => r.method === 'POST' && r.url === `${base}/goals`);
    expect(created.request.body.description).toBe('praia');
    created.flush({ item: goal() });
    http.expectOne((r) => r.url === `${base}/goals` && r.method === 'GET').flush({ items: [], year: 2026, month: 1 });
    expect(component.saving()).toBeFalse();
    expect(component.showForm()).toBeFalse();

    component.openEdit(goal({ description: null, startDate: null, endDate: null, dueDay: undefined as unknown as number }));
    expect(component.editingId()).toBe(4);
    component.form.name = 'Casa 2';
    component.form.targetAmountBrl = 8000;
    component.form.startDate = '2026-02-01';
    component.form.endDate = '2026-08-01';
    component.form.description = '';
    component.save();
    http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/goals/4`).flush({ error: 'x' }, { status: 422, statusText: 'err' });
    expect(component.saving()).toBeFalse();

    component.save();
    http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/goals/4`).flush({ item: goal() });
    http
      .expectOne((r) => r.url === `${base}/goals` && r.method === 'GET')
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(component.loading()).toBeFalse();

    confirmSpy.and.returnValue(false);
    component.remove(goal());
    http.expectNone((r) => r.method === 'DELETE');
    confirmSpy.and.returnValue(true);
    component.remove(goal());
    http.expectOne((r) => r.method === 'DELETE' && r.url === `${base}/goals/4`).flush({ ok: true });
    http.expectOne((r) => r.method === 'GET' && r.url === `${base}/goals`).flush({ items: [], year: 2026, month: 1 });
    component.closeForm();
    expect(component.editingId()).toBeNull();
  });
});
