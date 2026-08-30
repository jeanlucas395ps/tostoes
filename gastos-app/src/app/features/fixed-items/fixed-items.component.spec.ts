import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { FixedItemsComponent } from './fixed-items.component';
import { environment } from '../../../environments/environment';
import { FinancialAccount, RecurringItem } from '../../core/models/api.models';

const base = environment.apiUrl;

const creditCard = {
  id: 30,
  name: 'Nubank',
  type: 'credit',
} as FinancialAccount;

const bankAccount = {
  id: 2,
  name: 'ActivoBanco',
  type: 'bank',
} as FinancialAccount;

function setup(data: Record<string, unknown>): {
  fixture: ComponentFixture<FixedItemsComponent>;
  component: FixedItemsComponent;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [FixedItemsComponent, HttpClientTestingModule],
    providers: [{ provide: ActivatedRoute, useValue: { snapshot: { data } } }],
  })
    .overrideComponent(FixedItemsComponent, { set: { template: '<div></div>', imports: [] } })
    .compileComponents();
  const fixture = TestBed.createComponent(FixedItemsComponent);
  return {
    fixture,
    component: fixture.componentInstance,
    http: TestBed.inject(HttpTestingController),
  };
}

function flushBoot(
  http: HttpTestingController,
  opts: { accounts?: FinancialAccount[]; installments?: boolean } = {}
): void {
  http.expectOne(`${base}/settings`).flush({ eurToBrlFallback: 6.1, usdToBrlFallback: 5.1 });
  http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
  http.expectOne(`${base}/auth/users`).flush({ items: [] });
  http.expectOne((r) => r.url === `${base}/accounts`).flush({ items: opts.accounts ?? [] });
  http
    .expectOne(
      (r) =>
        r.url === `${base}/recurring-items` &&
        (opts.installments
          ? r.params.get('installments') === '1'
          : r.params.get('installments') !== '1')
    )
    .flush({ items: [] });
}

describe('FixedItemsComponent (installment mode)', () => {
  let fixture: ComponentFixture<FixedItemsComponent>;
  let component: FixedItemsComponent;
  let http: HttpTestingController;
  let alertSpy: jasmine.Spy;

  beforeEach(() => {
    alertSpy = spyOn(window, 'alert');
    ({ fixture, component, http } = setup({
      kind: 'expense',
      title: 'Compras parceladas',
      subtitle: '',
      accent: 'orange',
      categoryDefault: 'Geral',
      installmentMode: true,
    }));
    fixture.detectChanges();
    flushBoot(http, {
      accounts: [bankAccount, creditCard],
      installments: true,
    });
  });

  afterEach(() => http.verify());

  it('filters credit cards for installment source', () => {
    expect(component.isInstallmentMode()).toBeTrue();
    expect(component.creditFinancialAccounts().map((a) => a.id)).toEqual([30]);
    expect(component.pureBankAccounts().map((a) => a.id)).toEqual([2]);
  });

  it('requires a credit card before saving', () => {
    component.form.name = 'Sofá';
    component.form.startMonth = '2026-02';
    component.form.endMonth = '2026-05';
    component.form.sourceFinancialAccountId = null;
    component.save();
    expect(alertSpy).toHaveBeenCalled();
    expect(String(alertSpy.calls.mostRecent().args[0])).toContain('cartão');
    http.expectNone(`${base}/recurring-items`);
  });

  it('rejects bank as installment source', () => {
    component.form.name = 'Sofá';
    component.form.startMonth = '2026-02';
    component.form.endMonth = '2026-05';
    component.form.sourceFinancialAccountId = 2;
    component.save();
    expect(alertSpy).toHaveBeenCalled();
    http.expectNone(`${base}/recurring-items`);
  });

  it('saves installment linked to a credit card', () => {
    component.form.name = 'Sofá';
    component.form.startMonth = '2026-02';
    component.form.endMonth = '2026-05';
    component.form.sourceFinancialAccountId = 30;
    component.form.amount = 500;
    component.save();
    const req = http.expectOne(`${base}/recurring-items`);
    expect(req.request.body).toEqual(
      jasmine.objectContaining({
        isInstallment: true,
        startDate: '2026-02-01',
        endDate: '2026-05-01',
        sourceFinancialAccountId: 30,
        name: 'Sofá',
      })
    );
    req.flush({ item: { id: 1 } as RecurringItem });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
    http
      .expectOne((r) => r.url === `${base}/recurring-items` && r.params.get('installments') === '1')
      .flush({ items: [] });
  });

  it('canAdvance only for credit-linked installments', () => {
    expect(
      component.canAdvance({ id: 1, sourceFinancialAccountId: 30 } as RecurringItem)
    ).toBeTrue();
    expect(
      component.canAdvance({ id: 2, sourceFinancialAccountId: 2 } as RecurringItem)
    ).toBeFalse();
  });

  it('submitAdvance posts bank→card advance-payment', () => {
    const item = {
      id: 9,
      name: 'TesteParcela',
      amount: 500,
      currency: 'BRL',
      sourceFinancialAccountId: 30,
    } as RecurringItem;
    component.advancePrompt.set(item);
    component.advanceBankId.set(2);
    component.advanceAmount.set(500);
    component.advanceDate.set('2026-08-15');
    component.submitAdvance();
    const req = http.expectOne(
      (r) => r.url === `${base}/accounts/30/advance-payment` && r.method === 'POST'
    );
    expect(req.request.body).toEqual(
      jasmine.objectContaining({
        sourceAccountId: 2,
        amount: 500,
        itemNames: ['TesteParcela'],
      })
    );
    req.flush({ ok: true, outTransactionId: 1, inTransactionId: 2, description: 'x' });
    expect(component.advancePrompt()).toBeNull();
    expect(alertSpy).toHaveBeenCalled();
  });
});
