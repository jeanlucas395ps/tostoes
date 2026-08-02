import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { MovementsPage } from './movements.page';
import { environment } from '../../../environments/environment';
import { LedgerView, MonthPlanEntry, Transaction } from '../../core/models/api.models';

describe('MovementsPage', () => {
  let fixture: ComponentFixture<MovementsPage>;
  let component: MovementsPage;
  let http: HttpTestingController;
  const base = environment.apiUrl;

  const pendingFixed: MonthPlanEntry = {
    id: 1,
    kind: 'expense',
    name: 'Aluguel',
    category: 'Moradia',
    region: 'BR',
    recurringItemId: 10,
    dueDay: 5,
    suggestedAmountBrl: 1500,
    status: 'pending',
  };
  const pendingVariable: MonthPlanEntry = {
    id: 2,
    kind: 'expense',
    name: 'Mercado',
    category: 'Geral',
    region: 'BR',
    recurringItemId: null,
    dueDay: 20,
    suggestedAmountBrl: 300,
    status: 'pending',
  };
  const confirmedOlder: Transaction = {
    id: 100,
    transactionDate: '2026-07-01',
    kind: 'income',
    description: 'Salário',
    amount: 5000,
    currency: 'BRL',
    amountBrl: 5000,
    category: 'Salário',
    region: 'BR',
  };
  const confirmedNewer: Transaction = {
    id: 101,
    transactionDate: '2026-07-15',
    kind: 'expense',
    description: 'Luz',
    amount: 200,
    currency: 'BRL',
    amountBrl: 200,
    category: 'Energia',
    region: 'BR',
  };

  function flushLedger(overrides: Partial<LedgerView> = {}): void {
    const req = http.expectOne((r) => r.url === `${base}/ledger`);
    req.flush({
      year: 2026,
      month: 7,
      pending: [pendingFixed, pendingVariable],
      confirmed: [confirmedNewer, confirmedOlder],
      summary: {
        incomeTotal: 5000,
        expenseTotal: 200,
        balance: 4800,
        pendingCount: 2,
        confirmedCount: 2,
        projected: { income: 0, expense: 0, balance: 0 },
      },
      ...overrides,
    } as LedgerView);
  }

  beforeEach(async () => {
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {}, onDidDismiss: async () => ({}) });
    const toastSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastSpy.create.and.resolveTo({ present: async () => {} });

    await TestBed.configureTestingModule({
      imports: [MovementsPage, HttpClientTestingModule],
      providers: [
        { provide: AlertController, useValue: alertSpy },
        { provide: ToastController, useValue: toastSpy },
      ],
    })
      .overrideComponent(MovementsPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(MovementsPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne(`${base}/settings`).flush({ eurToBrlFallback: 6.1, usdToBrlFallback: 5.1 });
    http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [] });
    http.expectOne(`${base}/investment-types`).flush({ items: [] });
    http.expectOne(`${base}/auth/users`).flush({ items: [] });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    flushLedger();
  });

  afterEach(() => http.verify());

  it('starts on the pending segment', () => {
    expect(component.activeSegment()).toBe('pending');
  });

  it('sorts pending: variable entries first, then by due day, then by name', () => {
    const sorted = component.sortedPending();
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });

  it('sorts confirmed by transaction date ascending', () => {
    const sorted = component.sortedConfirmed();
    expect(sorted[0].id).toBe(100);
    expect(sorted[1].id).toBe(101);
  });

  it('skip() calls the skip endpoint and reloads the ledger', () => {
    component.skip(pendingFixed);
    http.expectOne(`${base}/month-plan/${pendingFixed.id}/skip`).flush({});
    flushLedger();
    expect(component.busyId()).toBeNull();
  });

  it('confirm() fetches accounts and opens the confirm dialog', () => {
    component.confirm(pendingVariable);
    http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: [{ id: 9 } as never] });
    expect(component.confirmEntry()).toEqual(pendingVariable);
    expect(component.accounts().length).toBe(1);
  });
});
