import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AccountFormComponent } from './account-form.component';
import { environment } from '../../../../environments/environment';
import { FinancialAccount } from '../../../core/models/api.models';

describe('AccountFormComponent', () => {
  let fixture: ComponentFixture<AccountFormComponent>;
  let component: AccountFormComponent;
  let http: HttpTestingController;
  const base = environment.apiUrl;

  const existing: FinancialAccount = {
    id: 5,
    name: 'Nubank',
    type: 'credit',
    currency: 'BRL',
    initialBalance: 100,
    initialBalanceDate: '2026-01-01',
    creditLimit: 3000,
    closingDay: 10,
    dueDay: 17,
    color: '#f59e0b',
    sortOrder: 0,
    balance: 100,
    balanceBrl: 100,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountFormComponent, HttpClientTestingModule],
    })
      .overrideComponent(AccountFormComponent, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(AccountFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('defaults to a blank bank form when creating', () => {
    fixture.detectChanges();
    expect(component.isEditing()).toBeFalse();
    expect(component.form.type).toBe('bank');
    expect(component.form.color).toBe('#3b82f6');
  });

  it('populates the form from the account input when editing', () => {
    fixture.componentRef.setInput('account', existing);
    fixture.detectChanges();
    expect(component.isEditing()).toBeTrue();
    expect(component.isCredit()).toBeTrue();
    expect(component.form.name).toBe('Nubank');
    expect(component.form.creditLimit).toBe(3000);
  });

  it('fills in defaults when editing a credit account missing optional fields', () => {
    const bare: FinancialAccount = { ...existing, color: undefined, creditLimit: undefined, closingDay: undefined, dueDay: undefined };
    fixture.componentRef.setInput('account', bare);
    fixture.detectChanges();
    expect(component.form.color).toBe('#f59e0b');
    expect(component.form.creditLimit).toBe(5000);
    expect(component.form.closingDay).toBe(1);
    expect(component.form.dueDay).toBe(10);
  });

  it('updates the default color on type change only when creating', () => {
    fixture.detectChanges();
    component.form.type = 'investment';
    component.onTypeChange();
    expect(component.form.color).toBe('#a371f7');

    fixture.componentRef.setInput('account', existing);
    fixture.detectChanges();
    component.form.type = 'bank';
    component.onTypeChange();
    expect(component.form.color).toBe('#f59e0b');
  });

  it('blocks save when name is empty', () => {
    fixture.detectChanges();
    component.form.name = '   ';
    component.save();
    expect(component.error()).toContain('nome');
  });

  it('sends credit fields as null for non-credit accounts', () => {
    fixture.detectChanges();
    component.form.name = 'Carteira';
    component.form.type = 'bank';
    let emitted = false;
    component.saved.subscribe(() => (emitted = true));
    component.save();
    const req = http.expectOne(`${base}/accounts`);
    expect(req.request.body.creditLimit).toBeNull();
    expect(req.request.body.closingDay).toBeNull();
    expect(req.request.body.cdiMonthlyRate).toBeNull();
    req.flush({ item: existing });
    expect(emitted).toBeTrue();
  });

  it('sends optional cdiMonthlyRate for investment accounts', () => {
    fixture.detectChanges();
    component.form.name = 'NuInvest';
    component.form.type = 'investment';
    component.form.cdiMonthlyRate = 0.012;
    component.save();
    const req = http.expectOne(`${base}/accounts`);
    expect(req.request.body.type).toBe('investment');
    expect(req.request.body.cdiMonthlyRate).toBe(0.012);
    expect(req.request.body.creditLimit).toBeNull();
    req.flush({ item: { ...existing, type: 'investment', cdiMonthlyRate: 0.012 } });
  });

  it('sends null cdiMonthlyRate when investment uses settings fallback', () => {
    fixture.detectChanges();
    component.form.name = 'NuInvest';
    component.form.type = 'investment';
    component.form.cdiMonthlyRate = null;
    component.save();
    const req = http.expectOne(`${base}/accounts`);
    expect(req.request.body.cdiMonthlyRate).toBeNull();
    req.flush({ item: { ...existing, type: 'investment', cdiMonthlyRate: null } });
  });

  it('PUTs to the account id when editing', () => {
    fixture.componentRef.setInput('account', existing);
    fixture.detectChanges();
    component.save();
    const req = http.expectOne(`${base}/accounts/5`);
    expect(req.request.method).toBe('PUT');
    req.flush({ item: existing });
  });

  it('surfaces the API error message on failure', () => {
    fixture.detectChanges();
    component.form.name = 'Carteira';
    component.save();
    http.expectOne(`${base}/accounts`).flush({ error: 'Nome duplicado.' }, { status: 400, statusText: 'Bad Request' });
    expect(component.error()).toBe('Nome duplicado.');
    expect(component.saving()).toBeFalse();
  });

  it('falls back to a default error message on failure', () => {
    fixture.detectChanges();
    component.form.name = 'Carteira';
    component.save();
    http.expectOne(`${base}/accounts`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.error()).toBe('Não foi possível salvar a conta.');
  });
});
