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
  alertCreate: jasmine.Spy;
  toastCreate: jasmine.Spy;
} {
  const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
  alertSpy.create.and.resolveTo({ present: async () => {} });
  const toastSpy = jasmine.createSpyObj('ToastController', ['create']);
  toastSpy.create.and.resolveTo({ present: async () => {} });

  TestBed.configureTestingModule({
    imports: [FixedItemsPage, HttpClientTestingModule],
    providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      { provide: AlertController, useValue: alertSpy },
      { provide: ToastController, useValue: toastSpy },
    ],
  })
    .overrideComponent(FixedItemsPage, { set: { template: '<div></div>', imports: [] } })
    .compileComponents();
  const fixture = TestBed.createComponent(FixedItemsPage);
  return {
    fixture,
    component: fixture.componentInstance,
    http: TestBed.inject(HttpTestingController),
    alertCreate: alertSpy.create,
    toastCreate: toastSpy.create,
  };
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
  let alertCreate: jasmine.Spy;
  let toastCreate: jasmine.Spy;

  beforeEach(() => {
    ({ fixture, component, http, alertCreate, toastCreate } = setup(expenseData));
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

  it('shows a toast with the server error when saving fails', async () => {
    component.form.name = 'Aluguel';
    await component.save();
    http.expectOne(`${base}/recurring-items`).flush({ error: 'Categoria inválida.' }, { status: 400, statusText: 'Bad Request' });
    expect(toastCreate).toHaveBeenCalled();
    expect(component.saving()).toBeFalse();
  });

  it('reloads on refresh and completes the refresher', () => {
    const refresher = { complete: jasmine.createSpy('complete') } as unknown as HTMLIonRefresherElement;
    component.onRefresh({ target: refresher } as unknown as CustomEvent);
    http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
    expect(refresher.complete).toHaveBeenCalled();
  });

  it('clears loading and completes the refresher on a load error', () => {
    const refresher = { complete: jasmine.createSpy('complete') } as unknown as HTMLIonRefresherElement;
    component.load(refresher);
    http.expectOne((r) => r.url === `${base}/recurring-items`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.loading()).toBeFalse();
    expect(refresher.complete).toHaveBeenCalled();
  });

  it('opens the new-item form, defaulting the custom tab', () => {
    component.openNew();
    expect(component.showForm()).toBeTrue();
    expect(component.editingId()).toBeNull();
    expect(component.form.customTabId).toBe(1);
  });

  it('toggles the edit form closed when tapping the same item twice', () => {
    const item = { id: 9, name: 'Luz', dueDay: 5 } as RecurringItem;
    component.openEdit(item);
    expect(component.showForm()).toBeTrue();
    expect(component.editingId()).toBe(9);
    component.openEdit(item);
    expect(component.showForm()).toBeFalse();
    expect(component.editingId()).toBeNull();
  });

  it('opens a different item for editing while one is already open', () => {
    component.openEdit({ id: 1, name: 'A' } as RecurringItem);
    component.openEdit({ id: 2, name: 'B', startDate: '2026-03-15' } as RecurringItem);
    expect(component.editingId()).toBe(2);
    expect(component.form.name).toBe('B');
    expect(component.form.startMonth).toBe('2026-03');
  });

  it('closeForm resets the edit state', () => {
    component.openEdit({ id: 1, name: 'A' } as RecurringItem);
    component.newCategoryMode.set(true);
    component.closeForm();
    expect(component.showForm()).toBeFalse();
    expect(component.editingId()).toBeNull();
    expect(component.newCategoryMode()).toBeFalse();
  });

  it('builds the category donut only for expense items', () => {
    component.items.set([
      { id: 1, category: 'Mercado', amount: 100 } as RecurringItem,
      { id: 2, itemCategoryName: 'Moradia', amount: 200 } as RecurringItem,
      { id: 3, category: 'Mercado', defaultAmountBrl: 50 } as RecurringItem,
    ]);
    const donut = component.categoryDonut();
    expect(donut).not.toBeNull();
    const labels = donut?.slices.map((s) => s.label).sort();
    expect(labels).toEqual(['Mercado', 'Moradia']);
  });

  it('endMonthFromStart is empty without a start month', () => {
    component.form.startMonth = '';
    expect(component.endMonthFromStart()).toBe('');
  });

  it('shows no account label when the entry has no source account', () => {
    expect(component.itemAccountLabel({ id: 1 } as RecurringItem)).toBeNull();
  });

  it('labels the payment account for an expense entry', () => {
    const label = component.itemAccountLabel({ id: 1, sourceFinancialAccountName: 'Nubank' } as RecurringItem);
    expect(label).toBe('Pagamento: Nubank');
  });

  it('falls back to defaultAmountBrl when amount is absent', () => {
    expect(component.itemLabel({ id: 1, defaultAmountBrl: 250 } as RecurringItem)).toContain('250');
  });

  it('computes the BRL preview for a foreign-currency amount', () => {
    component.form.currency = 'EUR';
    component.form.amount = 10;
    expect(component.formPreviewBrl()).toBe(10 * component.eurToBrl());
    component.form.currency = 'USD';
    expect(component.formPreviewBrl()).toBe(10 * component.usdToBrl());
  });

  describe('remove', () => {
    it('deletes the item and reloads after confirming', async () => {
      const item = { id: 7, name: 'Netflix' } as RecurringItem;
      await component.remove(item);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/recurring-items/7`).flush({ ok: true });
      http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
    });
  });
});

describe('FixedItemsPage (income)', () => {
  let fixture: ComponentFixture<FixedItemsPage>;
  let component: FixedItemsPage;
  let http: HttpTestingController;

  const incomeData = {
    kind: 'income',
    title: 'Recebimentos fixos',
    subtitle: '',
    accent: 'green',
    categoryDefault: 'Geral',
    userOverviewTabs: true,
  };

  beforeEach(() => {
    ({ fixture, component, http } = setup(incomeData));
    fixture.detectChanges();
    flushBoot(http);
  });

  afterEach(() => http.verify());

  it('labels the destination account for an income entry', () => {
    const label = component.itemAccountLabel({ id: 1, sourceFinancialAccountName: 'Nubank' } as RecurringItem);
    expect(label).toBe('Conta: Nubank (destino)');
  });

  it('does not build a category donut for income items', () => {
    component.items.set([{ id: 1, category: 'Salário', amount: 5000 } as RecurringItem]);
    expect(component.categoryDonut()).toBeNull();
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

  it('does not use custom tabs for investments', () => {
    expect(component.usesCustomTabs()).toBeFalse();
  });

  it('labels source and destination when both are present', () => {
    const label = component.itemAccountLabel({
      id: 1,
      sourceFinancialAccountName: 'Nubank',
      financialAccountName: 'NuInvest',
    } as RecurringItem);
    expect(label).toBe('Nubank → NuInvest');
  });

  it('labels only the destination when there is no source', () => {
    const label = component.itemAccountLabel({ id: 1, financialAccountName: 'NuInvest' } as RecurringItem);
    expect(label).toBe('Entrada: NuInvest');
  });

  it('labels only the source when there is no destination', () => {
    const label = component.itemAccountLabel({ id: 1, sourceFinancialAccountName: 'Nubank' } as RecurringItem);
    expect(label).toBe('Saída: Nubank');
  });

  it('returns no label when investments have neither account', () => {
    expect(component.itemAccountLabel({ id: 1 } as RecurringItem)).toBeNull();
  });
});
