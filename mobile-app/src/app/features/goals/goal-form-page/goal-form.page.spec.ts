import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { GoalFormPage } from './goal-form.page';
import { environment } from '../../../../environments/environment';
import { FinancialAccount, FinancialGoal } from '../../../core/models/api.models';

describe('GoalFormPage', () => {
  let fixture: ComponentFixture<GoalFormPage>;
  let component: GoalFormPage;
  let http: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  const base = environment.apiUrl;

  const investmentAccount: FinancialAccount = {
    id: 3,
    name: 'Reserva',
    type: 'investment',
    currency: 'BRL',
    initialBalance: 0,
    initialBalanceDate: '2026-01-01',
    sortOrder: 0,
    balance: 1000,
    balanceBrl: 1000,
  };

  function createComponent(navigationState?: { goal: FinancialGoal }): void {
    router = jasmine.createSpyObj('Router', ['navigateByUrl', 'getCurrentNavigation']);
    router.getCurrentNavigation.and.returnValue(
      navigationState ? ({ extras: { state: navigationState } } as never) : null
    );

    TestBed.configureTestingModule({
      imports: [GoalFormPage, HttpClientTestingModule],
      providers: [{ provide: Router, useValue: router }],
    })
      .overrideComponent(GoalFormPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(GoalFormPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'bank').flush({ items: [] });
    http
      .expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'investment')
      .flush({ items: [investmentAccount] });
  }

  afterEach(() => http.verify());

  it('starts blank when there is no goal in the router state', () => {
    createComponent();
    expect(component.isEditing()).toBeFalse();
    expect(component.form.name).toBe('');
  });

  it('prefills the form from the goal passed via router state', () => {
    const existing: FinancialGoal = {
      id: 9,
      name: 'Casa',
      color: '#123456',
      targetAmountBrl: 10000,
      currentAmountBrl: 1000,
      confirmedContributionsBrl: 0,
      plannedAmountBrl: 0,
      monthlyAmountBrl: 0,
      monthCount: 12,
      projectedMonthBrl: 0,
      dueDay: 5,
      sortOrder: 0,
      pct: 10,
      plannedPct: 10,
      confirmedBarPct: 10,
      timelinePct: 10,
      overTarget: false,
      tracksInvestment: true,
      startDate: '2026-01-01',
      endDate: '2026-12-01',
    };
    createComponent({ goal: existing });
    expect(component.isEditing()).toBeTrue();
    expect(component.form.name).toBe('Casa');
    expect(component.form.color).toBe('#123456');
  });

  it('requires a name before saving', () => {
    createComponent();
    component.save();
    expect(component.error()).toContain('nome');
  });

  it('requires the target amount to exceed the current account balance', () => {
    createComponent();
    component.form.name = 'Viagem';
    component.form.targetFinancialAccountId = 3;
    component.form.targetAmountBrl = 500;
    component.save();
    expect(component.error()).toContain('maior que o saldo atual');
  });

  it('computes a positive suggested installment for a valid period', () => {
    createComponent();
    component.form.targetFinancialAccountId = 3;
    component.form.targetAmountBrl = 3400;
    component.form.startDate = '2026-01-01';
    component.form.endDate = '2026-12-01';
    expect(component.computedMonthly()).toBe(200);
  });

  it('saves and navigates back to the goals list', () => {
    createComponent();
    component.form.name = 'Viagem';
    component.form.targetFinancialAccountId = 3;
    component.form.targetAmountBrl = 5000;
    component.form.startDate = '2026-01-01';
    component.form.endDate = '2026-12-01';
    component.save();
    const req = http.expectOne(`${base}/goals`);
    req.flush({ item: {} as FinancialGoal });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/metas');
  });

  it('navigates back without saving on cancel', () => {
    createComponent();
    component.cancel();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/metas');
  });
});
