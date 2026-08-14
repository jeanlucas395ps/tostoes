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
  let alertCreate: jasmine.Spy;
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
    alertCreate = alertSpy.create;

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
    const req = http.expectOne((r) => r.url === `${base}/accounts/7`);
    expect(req.request.params.get('kind')).toBe('expense');
    expect(req.request.params.get('search')).toBe('mercado');
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

  it('navigates back to /contas after confirming removal', async () => {
    fixture.detectChanges();
    flush();
    await component.remove();
    const config = alertCreate.calls.mostRecent().args[0];
    const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
    destructive.handler();
    http.expectOne(`${base}/accounts/7`).flush({ ok: true });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/contas');
  });

  it('remove() is a no-op without a loaded account', async () => {
    fixture.detectChanges();
    await component.remove();
    expect(alertCreate).not.toHaveBeenCalled();
    flush();
  });

  it('labels the confirmation "cartão" for credit accounts', async () => {
    fixture.detectChanges();
    flush({ type: 'credit' });
    await component.remove();
    const config = alertCreate.calls.mostRecent().args[0];
    expect(config.message).toContain('cartão');
  });

  it('reloads when the year or month changes', () => {
    fixture.detectChanges();
    flush();
    component.onYearChange(2027);
    expect(component.year()).toBe(2027);
    flush();
    component.onMonthChange(3);
    expect(component.month()).toBe(3);
    flush();
  });

  it('hasActiveFilters reflects the kind and search signals', () => {
    fixture.detectChanges();
    flush();
    expect(component.hasActiveFilters()).toBeFalse();
    component.kindFilter.set('expense');
    expect(component.hasActiveFilters()).toBeTrue();
    component.kindFilter.set('');
    component.search.set('  x  ');
    expect(component.hasActiveFilters()).toBeTrue();
  });

  it('onSaved closes the form and reloads', () => {
    fixture.detectChanges();
    flush();
    component.showForm.set(true);
    component.onSaved();
    expect(component.showForm()).toBeFalse();
    flush();
  });

  it('clears loading on a load error', () => {
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/accounts/7`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.loading()).toBeFalse();
  });
});
