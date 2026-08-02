import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { FixedItemsPage } from './fixed-items.page';
import { environment } from '../../../environments/environment';
import { RecurringItem } from '../../core/models/api.models';

const base = environment.apiUrl;

function setup(data: Record<string, unknown>): {
  fixture: ComponentFixture<FixedItemsPage>;
  component: FixedItemsPage;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [FixedItemsPage, HttpClientTestingModule],
    providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      { provide: AlertController, useValue: jasmine.createSpyObj('AlertController', ['create']) },
      { provide: ToastController, useValue: jasmine.createSpyObj('ToastController', ['create']) },
    ],
  })
    .overrideComponent(FixedItemsPage, { set: { template: '<div></div>', imports: [] } })
    .compileComponents();
  const fixture = TestBed.createComponent(FixedItemsPage);
  return { fixture, component: fixture.componentInstance, http: TestBed.inject(HttpTestingController) };
}

function flushBoot(http: HttpTestingController, hasInvestment = false): void {
  http.expectOne(`${base}/settings`).flush({ eurToBrlFallback: 6.1, usdToBrlFallback: 5.1 });
  http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [{ id: 1, name: 'Brasil', sortOrder: 0 }], itemCategories: [] });
  http.expectOne(`${base}/auth/users`).flush({ items: [{ id: 5, username: 'carol', name: 'Carol', gender: 'female' } as never] });
  http.expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'bank').flush({ items: [] });
  if (hasInvestment) {
    http.expectOne(`${base}/investment-types`).flush({ items: [] });
    http.expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'investment').flush({ items: [] });
  }
  http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
}

const expenseData = {
  kind: 'expense',
  title: 'Gastos fixos',
  subtitle: '',
  accent: 'red',
  categoryDefault: 'Brasil',
  userOverviewTabs: true,
};

describe('FixedItemsPage (expense)', () => {
  let fixture: ComponentFixture<FixedItemsPage>;
  let component: FixedItemsPage;
  let http: HttpTestingController;

  beforeEach(() => {
    ({ fixture, component, http } = setup(expenseData));
    fixture.detectChanges();
    flushBoot(http);
  });

  afterEach(() => http.verify());

  it('uses custom tabs for expense but not investment', () => {
    expect(component.usesCustomTabs()).toBeTrue();
    expect(component.isInvestment()).toBeFalse();
    expect(component.showCategoryPicker()).toBeTrue();
  });

  it('groups items into a "Total" tab plus one per household user', () => {
    component.items.set([
      { id: 1, responsibleUserId: null, amount: 100 } as RecurringItem,
      { id: 2, responsibleUserId: 5, amount: 300 } as RecurringItem,
    ]);
    const tabs = component.userTabOverviews();
    expect(tabs.map((t) => t.key)).toEqual(['all', 'conjunto', 5]);
    expect(tabs[0].totalBrl).toBe(400);
    expect(tabs[2].totalBrl).toBe(300);
  });

  it('filters the list by the active user tab', () => {
    component.items.set([
      { id: 1, responsibleUserId: null } as RecurringItem,
      { id: 2, responsibleUserId: 5 } as RecurringItem,
    ]);
    component.setUserTab(5);
    expect(component.itemsByUserTab().map((i) => i.id)).toEqual([2]);
    component.setUserTab('conjunto');
    expect(component.itemsByUserTab().map((i) => i.id)).toEqual([1]);
  });

  it('switches to new-category mode and suggests an icon', () => {
    component.onCategorySelect('__new__');
    expect(component.newCategoryMode()).toBeTrue();
    component.onNewCategoryNameChange('Mercado');
    expect(component.form.newCategoryIcon).toBe('shopping-cart');
  });

  it('requires a name before saving', async () => {
    await component.save();
    expect(component.error()).toContain('nome');
  });

  it('sends category from the taxonomy and closes the form on success', async () => {
    component.form.name = 'Aluguel';
    component.form.itemCategoryId = null;
    await component.save();
    const req = http.expectOne(`${base}/recurring-items`);
    expect(req.request.body.category).toBe('Brasil');
    expect(req.request.body.kind).toBe('expense');
    req.flush({ item: {} as RecurringItem });
    http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
    expect(component.showForm()).toBeFalse();
  });
});

describe('FixedItemsPage (installment mode)', () => {
  let fixture: ComponentFixture<FixedItemsPage>;
  let component: FixedItemsPage;
  let http: HttpTestingController;

  beforeEach(() => {
    ({ fixture, component, http } = setup({ ...expenseData, installmentMode: true, categoryDefault: 'Geral' }));
    fixture.detectChanges();
    flushBoot(http);
  });

  afterEach(() => http.verify());

  it('does not use custom tabs while in installment mode', () => {
    expect(component.usesCustomTabs()).toBeFalse();
  });

  it('computes the end month from the start month and installment count', () => {
    component.form.startMonth = '2026-01';
    component.form.installmentCount = 3;
    expect(component.endMonthFromStart()).toBe('2026-03');
  });

  it('clamps the installment count to the [2, 48] range', () => {
    component.clampInstallments(1);
    expect(component.form.installmentCount).toBe(2);
    component.clampInstallments(999);
    expect(component.form.installmentCount).toBe(48);
  });

  it('requires a start month before saving', async () => {
    component.form.name = 'Sofá';
    component.form.startMonth = '';
    await component.save();
    expect(component.error()).toContain('parcela');
  });

  it('sends isInstallment with the start/end dates', async () => {
    component.form.name = 'Sofá';
    component.form.startMonth = '2026-02';
    component.form.installmentCount = 4;
    await component.save();
    const req = http.expectOne(`${base}/recurring-items`);
    expect(req.request.body.isInstallment).toBeTrue();
    expect(req.request.body.startDate).toBe('2026-02-01');
    expect(req.request.body.endDate).toBe('2026-05-01');
    req.flush({ item: {} as RecurringItem });
    http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
  });
});

describe('FixedItemsPage (investment)', () => {
  let fixture: ComponentFixture<FixedItemsPage>;
  let component: FixedItemsPage;
  let http: HttpTestingController;

  beforeEach(() => {
    ({ fixture, component, http } = setup({
      kind: 'investment',
      title: 'Investimentos fixos',
      subtitle: '',
      accent: 'purple',
      categoryDefault: 'Investimento',
      userOverviewTabs: true,
    }));
    fixture.detectChanges();
    flushBoot(http, true);
  });

  afterEach(() => http.verify());

  it('hides the category picker and uses the route categoryDefault', async () => {
    expect(component.showCategoryPicker()).toBeFalse();
    component.form.name = 'Reserva';
    await component.save();
    const req = http.expectOne(`${base}/recurring-items`);
    expect(req.request.body.category).toBe('Investimento');
    expect(req.request.body.itemCategoryId).toBeNull();
    req.flush({ item: {} as RecurringItem });
    http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
  });
});
