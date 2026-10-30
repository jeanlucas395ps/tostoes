import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { FixedItemsComponent } from './fixed-items.component';
import { environment } from '../../../environments/environment';
import { FinancialAccount, RecurringItem, User } from '../../core/models/api.models';

const base = environment.apiUrl;

function item(over: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: 1,
    kind: 'expense',
    name: 'Aluguel',
    category: 'Casa',
    region: 'geral',
    defaultAmountBrl: 100,
    isFixed: true,
    dueDay: 5,
    currency: 'BRL',
    amount: 100,
    ...over,
  };
}

function user(id: number, name: string): User {
  return { id, username: name.toLowerCase(), name, gender: 'male' };
}

describe('FixedItemsComponent (class coverage)', () => {
  let fixture: ComponentFixture<FixedItemsComponent>;
  let component: FixedItemsComponent;
  let http: HttpTestingController;
  let alertSpy: jasmine.Spy;
  let confirmSpy: jasmine.Spy;

  function setup(data: Record<string, unknown>): void {
    TestBed.configureTestingModule({
      imports: [FixedItemsComponent, HttpClientTestingModule],
      providers: [{ provide: ActivatedRoute, useValue: { snapshot: { data } } }],
    })
      .overrideComponent(FixedItemsComponent, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(FixedItemsComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  }

  function flush(
    opts: {
      items?: RecurringItem[];
      tabs?: { id: number; name: string; sortOrder: number }[];
      categories?: { id: number; name: string; icon: string; sortOrder: number }[];
      users?: User[];
      accounts?: FinancialAccount[];
      investment?: boolean;
      error?: boolean;
    } = {}
  ): void {
    http.expectOne(`${base}/settings`).flush({ eurToBrl: 6, usdToBrl: 5 });
    http.expectOne(`${base}/planning-taxonomy`).flush({
      customTabs: opts.tabs ?? [],
      itemCategories: opts.categories ?? [],
    });
    if (opts.error) {
      http
        .expectOne((r) => r.url === `${base}/recurring-items`)
        .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    } else {
      http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: opts.items ?? [] });
    }
    http.expectOne(`${base}/auth/users`).flush({ items: opts.users ?? [] });
    http.expectOne((r) => r.url === `${base}/accounts` && !r.params.get('type')).flush({
      items: opts.accounts ?? [],
    });
    if (opts.investment) {
      http.expectOne(`${base}/investment-types`).flush({ items: [{ id: 1, name: 'Tesouro' }] });
      http
        .expectOne((r) => r.url === `${base}/accounts` && r.params.get('type') === 'investment')
        .flush({
          items: [
            { id: 8, name: 'Corretora', type: 'investment', currency: 'BRL' } as FinancialAccount,
          ],
        });
    }
  }

  afterEach(() => http.verify());

  describe('expense tabs and pie', () => {
    beforeEach(() => {
      alertSpy = spyOn(window, 'alert');
      confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
      setup({
        kind: 'expense',
        title: 'Gastos fixos',
        categoryDefault: 'Geral',
      });
      fixture.detectChanges();
      flush({
        tabs: [{ id: 3, name: 'Brasil', sortOrder: 1 }],
        categories: [{ id: 10, name: 'Casa', icon: 'home', sortOrder: 1 }],
        users: [user(2, 'Ana Silva')],
        accounts: [
          { id: 2, name: 'Nubank', type: 'bank' } as FinancialAccount,
          { id: 30, name: 'Visa', type: 'credit' } as FinancialAccount,
        ],
        items: [
          item({ id: 1, itemCategoryId: 10, itemCategoryName: 'Casa', customTabId: 3, customTabName: 'Brasil', defaultAmountBrl: 100 }),
          item({
            id: 2,
            name: 'Net',
            itemCategoryId: null,
            category: 'Internet',
            customTabId: null,
            currency: 'EUR',
            defaultAmountBrl: 0,
            amount: 10,
            responsibleUserId: 2,
            sourceFinancialAccountId: 30,
            sourceFinancialAccountName: 'Visa',
          }),
          item({
            id: 3,
            name: 'USD',
            currency: 'USD',
            defaultAmountBrl: 20,
            amount: 4,
            responsibleUserId: 9,
            responsibleUser: { id: 9, username: 'beto', name: 'Beto', gender: 'male' },
            responsible: 'Beto',
            sourceFinancialAccountId: 2,
            sourceFinancialAccountName: 'Nubank',
          }),
        ],
      });
    });

    it('filters tabs, categories, avatars and monthly brl', () => {
      expect(component.activeTab()).toBe(3);
      expect(component.usesCustomTabs()).toBeTrue();
      component.setTab('all');
      expect(component.filteredItems().length).toBe(3);
      component.setTab('geral');
      expect(component.filteredItems().map((i) => i.id)).toEqual([2, 3]);
      component.setTab('all');
      component.setCategory(10);
      expect(component.filteredItems().map((i) => i.id)).toEqual([1]);
      component.setCategory('sem');
      expect(component.filteredItems().length).toBe(2);
      component.setCategory('all');
      expect(component.showCategoryFilters()).toBeTrue();
      expect(component.categoryPieChart()?.slices.length).toBeGreaterThan(0);
      expect(component.tabCounts()['3']).toBe(1);
      expect(component.itemMonthlyBrl(component.items()[0])).toBe(100);
      expect(component.itemMonthlyBrl(component.items()[1])).toBeGreaterThan(0);
      expect(component.itemMonthlyBrl(component.items()[2])).toBe(20);
      expect(component.formPreviewBrl()).toBe(0);
      component.form.currency = 'EUR';
      component.form.amount = 2;
      component.eurToBrl.set(6.5);
      expect(component.formPreviewBrl()).toBe(13);
      expect(component.responsibleAvatarName(component.items()[2])).toBe('Beto');
      expect(component.responsibleAvatarUser(component.items()[1])?.name).toBe('Ana Silva');
      expect(component.responsibleAvatarUser(item({ responsibleUserId: null }))).toBeNull();
      expect(component.householdUserById(2)?.name).toBe('Ana Silva');
      expect(component.userForTabKey('all')).toBeNull();
      expect(component.userForTabKey(2)?.id).toBe(2);
      expect(component.itemAccountLabel(component.items()[1])).toContain('Cartão');
      expect(component.itemAccountLabel(component.items()[2])).toContain('Banco');
      expect(component.itemAccountLabel(item())).toBeNull();
      expect(component.itemSubtitle(item({
        isInstallment: true,
        startDate: '2026-01-01',
        endDate: '2026-03-01',
        customTabName: 'Brasil',
        itemCategoryName: 'Casa',
      }))).toContain('3x');
      expect(component.itemLabel(component.items()[0])).toContain('R$');
      expect(component.itemCategoryIcon(component.items()[0])).toBeTruthy();
      expect(component.defaultTabId()).toBe(3);
      expect(component.defaultBankAccountId()).toBe(2);
      expect(component.defaultCategoryId()).toBe(10);
      expect(component.lucideFor('home')).toBeTruthy();
    });

    it('creates, edits, rejects empty names and removes', () => {
      component.openNew();
      expect(component.showForm()).toBeTrue();
      expect(component.form.isInstallment).toBeFalse();
      component.form.name = '   ';
      component.save();
      http.expectNone((r) => r.method === 'POST' && r.url === `${base}/recurring-items`);

      component.form.name = 'Luz';
      component.form.amount = 80;
      component.newCategoryMode.set(true);
      component.form.newCategoryName = ' Energia ';
      component.form.newCategoryIcon = 'bolt';
      component.onNewCategoryNameChange('Energia');
      component.save();
      const created = http.expectOne((r) => r.method === 'POST' && r.url === `${base}/recurring-items`);
      expect(created.request.body.isInstallment).toBeFalse();
      expect(created.request.body.startDate).toBeNull();
      created.flush({ item: item({ id: 9 }) });
      http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
      http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
      expect(component.showForm()).toBeFalse();

      const row = item({ id: 4, startDate: '2026-02-01', endDate: '2026-04-01', itemCategoryId: 10 });
      component.openEdit(row);
      expect(component.form.installmentCount).toBe(3);
      component.openEdit(row);
      expect(component.showForm()).toBeFalse();
      component.openEdit(row);
      component.form.name = 'Luz 2';
      component.save();
      http.expectOne((r) => r.method === 'PUT' && r.url === `${base}/recurring-items/4`).flush({ item: row });
      http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
      http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });

      component.onCategorySelect('__new__');
      expect(component.newCategoryMode()).toBeTrue();
      component.onCategorySelect(10);
      expect(component.form.category).toBe('Casa');
      component.onCategorySelect(null);
      expect(component.form.itemCategoryId).toBeNull();
      component.monthsBetween('2026-01', '2026-01');
      expect(component.endMonthFromStart('2026-11', 0)).toBe('2026-11');
      component.form.startMonth = undefined;
      component.onInstallmentStartOrCountChange();
      component.form.startMonth = '2026-01';
      component.form.installmentCount = 2;
      component.onInstallmentStartOrCountChange();
      expect(component.form.endMonth).toBe('2026-02');

      confirmSpy.and.returnValue(false);
      component.remove(row);
      http.expectNone((r) => r.method === 'DELETE');
      confirmSpy.and.returnValue(true);
      component.remove(row);
      http.expectOne((r) => r.method === 'DELETE' && r.url === `${base}/recurring-items/4`).flush({ ok: true });
      http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('income user overview', () => {
    beforeEach(() => {
      spyOn(window, 'alert');
      spyOn(window, 'confirm').and.returnValue(true);
      setup({
        kind: 'income',
        title: 'Recebimentos',
        categoryDefault: 'Salário',
        userOverviewTabs: true,
      });
      fixture.detectChanges();
      flush({
        tabs: [{ id: 1, name: 'Brasil', sortOrder: 1 }],
        categories: [{ id: 4, name: 'Salário', icon: 'bank', sortOrder: 1 }],
        users: [user(2, 'Ana')],
        items: [
          item({ id: 1, kind: 'income', responsibleUserId: null, defaultAmountBrl: 1000, sourceFinancialAccountName: 'Nubank', sourceFinancialAccountId: 2 }),
          item({ id: 2, kind: 'income', responsibleUserId: 2, defaultAmountBrl: 0, amount: 0, currency: 'BRL' }),
          item({ id: 3, kind: 'income', responsibleUserId: 7, responsibleUser: { id: 7, username: 'outro', name: 'Outro', gender: 'male' }, defaultAmountBrl: 50 }),
        ],
        accounts: [{ id: 2, name: 'Nubank', type: 'bank' } as FinancialAccount],
      });
    });

    it('keeps the all tab and splits users including conjunto and orphans', () => {
      expect(component.activeTab()).toBe('all');
      expect(component.showCategoryPie()).toBeFalse();
      expect(component.categoryPieChart()).toBeNull();
      expect(component.userTabOverviews().some((t) => t.key === 'conjunto')).toBeTrue();
      expect(component.userTabOverviews().some((t) => t.key === 7)).toBeTrue();
      component.setUserTab('conjunto');
      expect(component.itemsByUserTab().map((i) => i.id)).toEqual([1]);
      component.setUserTab(2);
      expect(component.filteredItems().map((i) => i.id)).toEqual([2]);
      component.setUserTab('all');
      expect(component.activeUserOverview()?.key).toBe('all');
      expect(component.itemAccountLabel(component.items()[0])).toContain('destino');
      expect(component.itemMonthlyBrl(component.items()[1])).toBe(0);
      expect(component.defaultCategoryId()).toBe(4);
    });
  });

  describe('investment and load error', () => {
    beforeEach(() => {
      alertSpy = spyOn(window, 'alert');
      spyOn(window, 'confirm').and.returnValue(true);
      setup({ kind: 'investment', title: 'Aportes', categoryDefault: 'Geral' });
      fixture.detectChanges();
    });

    it('saves linked accounts and labels both sides', () => {
      flush({
        investment: true,
        items: [
          item({
            id: 1,
            kind: 'investment',
            sourceFinancialAccountName: 'Banco',
            financialAccountName: 'Tesouro',
          }),
          item({ id: 2, kind: 'investment', sourceFinancialAccountName: 'Banco' }),
          item({ id: 3, kind: 'investment', financialAccountName: 'Tesouro' }),
          item({ id: 4, kind: 'investment' }),
        ],
      });
      expect(component.isInvestment()).toBeTrue();
      expect(component.defaultInvestmentAccountId()).toBe(8);
      expect(component.itemAccountLabel(component.items()[0])).toBe('Banco → Tesouro');
      expect(component.itemAccountLabel(component.items()[1])).toContain('Saída');
      expect(component.itemAccountLabel(component.items()[2])).toContain('Entrada');
      expect(component.itemAccountLabel(component.items()[3])).toBeNull();
      component.openNew();
      expect(component.form.financialAccountId).toBeNull();
      component.form.name = 'Mensal';
      component.form.financialAccountId = 8;
      component.form.sourceFinancialAccountId = 2;
      component.save();
      const req = http.expectOne((r) => r.method === 'POST' && r.url === `${base}/recurring-items`);
      expect(req.request.body.financialAccountId).toBe(8);
      req.flush({ item: item({ id: 9 }) });
      http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
      http.expectOne((r) => r.url === `${base}/recurring-items`).flush({ items: [] });
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('stops loading when the list fails and fills the account if the form is open', () => {
      component.showForm.set(true);
      flush({ investment: true, error: true });
      expect(component.loading()).toBeFalse();
      expect(component.form.financialAccountId).toBe(8);
    });
  });
});
