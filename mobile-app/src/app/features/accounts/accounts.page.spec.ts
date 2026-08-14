import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AccountsPage } from './accounts.page';
import { environment } from '../../../environments/environment';
import { AccountsSummary, FinancialAccount } from '../../core/models/api.models';

describe('AccountsPage', () => {
  let fixture: ComponentFixture<AccountsPage>;
  let component: AccountsPage;
  let http: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  const base = environment.apiUrl;

  const bank: FinancialAccount = {
    id: 1,
    name: 'Itaú',
    type: 'bank',
    currency: 'BRL',
    initialBalance: 0,
    initialBalanceDate: '2026-01-01',
    sortOrder: 0,
    balance: 100,
    balanceBrl: 100,
  };
  const card: FinancialAccount = {
    ...bank,
    id: 2,
    name: 'Nubank',
    type: 'credit',
    limitUsagePercent: 150,
  };

  const summary: AccountsSummary = {
    accounts: [bank, card],
    totals: { bank: 100, investment: 0, all: 100 },
  };

  beforeEach(async () => {
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    await TestBed.configureTestingModule({
      imports: [AccountsPage, HttpClientTestingModule],
      providers: [{ provide: Router, useValue: router }],
    })
      .overrideComponent(AccountsPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(AccountsPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${base}/accounts/summary`).flush(summary);
  });

  afterEach(() => http.verify());

  it('groups accounts by type', () => {
    expect(component.banks().map((a) => a.id)).toEqual([1]);
    expect(component.cards().map((a) => a.id)).toEqual([2]);
    expect(component.investments()).toEqual([]);
  });

  it('clamps card usage percent to [0, 100]', () => {
    expect(component.cardUsagePct(card)).toBe(100);
  });

  it('navigates to the account detail route on tap', () => {
    component.openAccount(bank);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/contas/1');
  });

  it('reloads and closes the form after creating an account', () => {
    component.showForm.set(true);
    component.onCreated();
    expect(component.showForm()).toBeFalse();
    http.expectOne(`${base}/accounts/summary`).flush(summary);
  });

  it('defaults card usage to 0 when unset', () => {
    expect(component.cardUsagePct(bank)).toBe(0);
  });

  it('returns empty groups before the summary has loaded', () => {
    component.summary.set(null);
    expect(component.banks()).toEqual([]);
    expect(component.cards()).toEqual([]);
  });

  it('onRefresh reloads and completes the refresher', () => {
    const refresher = { complete: jasmine.createSpy('complete') } as unknown as HTMLIonRefresherElement;
    component.onRefresh({ target: refresher } as unknown as CustomEvent);
    http.expectOne(`${base}/accounts/summary`).flush(summary);
    expect(refresher.complete).toHaveBeenCalled();
  });

  it('clears loading on a load error', () => {
    component.load();
    http.expectOne(`${base}/accounts/summary`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.loading()).toBeFalse();
  });
});
