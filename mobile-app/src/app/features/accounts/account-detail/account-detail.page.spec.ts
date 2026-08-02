import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { AccountDetailPage } from './account-detail.page';
import { environment } from '../../../../environments/environment';
import { FinancialAccount } from '../../../core/models/api.models';

describe('AccountDetailPage', () => {
  let fixture: ComponentFixture<AccountDetailPage>;
  let component: AccountDetailPage;
  let http: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  const base = environment.apiUrl;

  const bankAccount: FinancialAccount = {
    id: 7,
    name: 'Itaú',
    type: 'bank',
    currency: 'BRL',
    initialBalance: 0,
    initialBalanceDate: '2026-01-01',
    sortOrder: 0,
    balance: 500,
    balanceBrl: 500,
  };

  beforeEach(async () => {
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {} });

    await TestBed.configureTestingModule({
      imports: [AccountDetailPage, HttpClientTestingModule],
      providers: [
        { provide: Router, useValue: router },
        { provide: AlertController, useValue: alertSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '7' } } },
        },
      ],
    })
      .overrideComponent(AccountDetailPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(AccountDetailPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flush(account: Partial<FinancialAccount> = {}): void {
    http
      .expectOne((r) => r.url === `${base}/accounts/7`)
      .flush({ item: { ...bankAccount, ...account } });
  }

  it('reads the account id from the route and loads it', () => {
    fixture.detectChanges();
    expect(component.accountId).toBe(7);
    flush();
    expect(component.account()?.name).toBe('Itaú');
  });

  it('exposes credit-specific kind labels only for credit accounts', () => {
    fixture.detectChanges();
    flush({ type: 'credit' });
    const labels = component.kindOptions().map((o) => o.label);
    expect(labels).toContain('Compras');
    expect(labels).not.toContain('Saídas');
  });

  it('sends kind and search filters to the API', () => {
    fixture.detectChanges();
    flush();
    component.kindFilter.set('expense');
    component.search.set('mercado');
    component.load();
    const req = http.expectOne(
      (r) => r.url === `${base}/accounts/7` && r.params.get('kind') === 'expense' && r.params.get('search') === 'mercado'
    );
    req.flush({ item: bankAccount });
  });

  it('clears filters and reloads', () => {
    fixture.detectChanges();
    flush();
    component.kindFilter.set('income');
    component.search.set('x');
    component.clearFilters();
    expect(component.kindFilter()).toBe('');
    expect(component.search()).toBe('');
    flush();
  });

  it('navigates back to /contas after removing the account', () => {
    fixture.detectChanges();
    flush();
    component.remove();
  });
});
