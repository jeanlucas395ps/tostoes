import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { GoalsPage } from './goals.page';
import { environment } from '../../../environments/environment';
import { FinancialGoal } from '../../core/models/api.models';

describe('GoalsPage', () => {
  let fixture: ComponentFixture<GoalsPage>;
  let component: GoalsPage;
  let http: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let alertCreate: jasmine.Spy;
  const base = environment.apiUrl;

  const goal: FinancialGoal = {
    id: 1,
    name: 'Viagem',
    color: '#000',
    targetAmountBrl: 5000,
    currentAmountBrl: 1000,
    confirmedContributionsBrl: 0,
    plannedAmountBrl: 0,
    monthlyAmountBrl: 400,
    monthCount: 10,
    projectedMonthBrl: 0,
    dueDay: 5,
    sortOrder: 0,
    pct: 20,
    plannedPct: 20,
    confirmedBarPct: 20,
    timelinePct: 20,
    overTarget: false,
    tracksInvestment: true,
  };

  beforeEach(async () => {
    router = jasmine.createSpyObj('Router', ['navigateByUrl', 'navigate']);
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {} });
    alertCreate = alertSpy.create;

    await TestBed.configureTestingModule({
      imports: [GoalsPage, HttpClientTestingModule],
      providers: [
        { provide: Router, useValue: router },
        { provide: AlertController, useValue: alertSpy },
      ],
    })
      .overrideComponent(GoalsPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(GoalsPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [goal], year: component.year, month: 1 });
  });

  afterEach(() => http.verify());

  it('navigates to the create-goal page', () => {
    component.openNew();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/metas/novo');
  });

  it('navigates to the edit page passing the goal via router state', () => {
    component.openEdit(goal);
    expect(router.navigate).toHaveBeenCalledWith(['/metas', 1, 'editar'], { state: { goal } });
  });

  it('deletes the goal after confirming removal', async () => {
    await component.remove(goal);
    const config = alertCreate.calls.mostRecent().args[0];
    const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
    destructive.handler();
    const deleteReq = http.expectOne(`${base}/goals/1`);
    expect(deleteReq.request.method).toBe('DELETE');
    deleteReq.flush({ ok: true });
    http.expectOne((r) => r.url === `${base}/goals`).flush({ items: [], year: component.year, month: 1 });
  });
});
