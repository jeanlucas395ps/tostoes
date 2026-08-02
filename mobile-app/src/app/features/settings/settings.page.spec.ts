import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AlertController } from '@ionic/angular/standalone';
import { SettingsPage } from './settings.page';
import { environment } from '../../../environments/environment';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let component: SettingsPage;
  let http: HttpTestingController;
  let alertCreate: jasmine.Spy;
  const base = environment.apiUrl;

  beforeEach(async () => {
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {} });
    alertCreate = alertSpy.create;

    await TestBed.configureTestingModule({
      imports: [SettingsPage, HttpClientTestingModule],
      providers: [{ provide: AlertController, useValue: alertSpy }],
    })
      .overrideComponent(SettingsPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne(`${base}/settings`).flush({
      eurToBrl: 6,
      eurToBrlFallback: 6.2,
      usdToBrlFallback: 5.3,
      cdiMonthlyRate: 0.009,
      leisureMonthlyBrl: 0,
      montanteInicialBrl: 0,
    });
    http.expectOne(`${base}/planning-taxonomy`).flush({
      customTabs: [{ id: 1, name: 'Brasil', sortOrder: 0 }],
      itemCategories: [{ id: 2, name: 'Mercado', icon: 'shopping-cart', sortOrder: 0 }],
    });
  });

  afterEach(() => http.verify());

  it('loads fallback rates into the form', () => {
    expect(component.form.eurToBrl).toBe(6.2);
    expect(component.form.usdToBrl).toBe(5.3);
  });

  it('sends only eurToBrl, usdToBrl and cdiMonthlyRate on save', () => {
    component.form = { eurToBrl: 6.5, usdToBrl: 5.5, cdiMonthlyRate: 0.01 };
    component.save();
    const req = http.expectOne(`${base}/settings`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ eurToBrl: 6.5, usdToBrl: 5.5, cdiMonthlyRate: 0.01 });
    req.flush({ eurToBrl: 6.5, eurToBrlFallback: 6.5, usdToBrlFallback: 5.5, cdiMonthlyRate: 0.01 });
    expect(component.saved()).toBeTrue();
  });

  it('suggests an icon when typing a new category name', () => {
    component.onNewCategoryNameChange('Mercado');
    expect(component.newCategoryIcon).toBe('shopping-cart');
  });

  it('adds a custom tab and reloads taxonomy', () => {
    component.newTabName = 'Portugal';
    component.addTab();
    http.expectOne(`${base}/planning-custom-tabs`).flush({ item: { id: 2, name: 'Portugal', sortOrder: 1 } });
    expect(component.newTabName).toBe('');
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
  });

  it('removes a custom tab after confirming', async () => {
    await component.removeTab({ id: 1, name: 'Brasil', sortOrder: 0 });
    const config = alertCreate.calls.mostRecent().args[0];
    const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
    destructive.handler();
    const req = http.expectOne(`${base}/planning-custom-tabs/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
  });

  it('updates a category icon immediately', () => {
    component.updateCategoryIcon({ id: 2, name: 'Mercado', icon: 'shopping-cart', sortOrder: 0 }, 'shopping-bag');
    const req = http.expectOne(`${base}/planning-item-categories/2`);
    expect(req.request.body).toEqual({ name: 'Mercado', icon: 'shopping-bag' });
    req.flush({ item: { id: 2, name: 'Mercado', icon: 'shopping-bag', sortOrder: 0 } });
    http.expectOne(`${base}/planning-taxonomy`).flush({ customTabs: [], itemCategories: [] });
  });
});
