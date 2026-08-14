import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { ForgotPasswordPage } from './forgot-password.page';
import { AuthService } from '../../core/services/auth.service';

describe('ForgotPasswordPage', () => {
  let fixture: ComponentFixture<ForgotPasswordPage>;
  let component: ForgotPasswordPage;
  let auth: jasmine.SpyObj<Pick<AuthService, 'forgotPasswordAsync'>>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj('AuthService', ['forgotPasswordAsync']);

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordPage, RouterModule.forRoot([])],
      providers: [{ provide: AuthService, useValue: auth }],
    })
      .overrideComponent(ForgotPasswordPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('requires an email before submitting', async () => {
    component.email = '   ';
    await component.submit();
    expect(component.error()).toBe('Informe seu e-mail.');
    expect(auth.forgotPasswordAsync).not.toHaveBeenCalled();
  });

  it('shows the success message on a successful request', async () => {
    auth.forgotPasswordAsync.and.resolveTo({ ok: true, message: 'Verifique seu e-mail.' });
    component.email = '  Jean@Example.com  ';
    await component.submit();
    expect(auth.forgotPasswordAsync).toHaveBeenCalledWith('jean@example.com');
    expect(component.success()).toBe('Verifique seu e-mail.');
    expect(component.loading()).toBeFalse();
  });

  it('falls back to a default success message', async () => {
    auth.forgotPasswordAsync.and.resolveTo({ ok: true });
    component.email = 'jean@example.com';
    await component.submit();
    expect(component.success()).toContain('receberá um link');
  });

  it('shows the server error message on failure', async () => {
    auth.forgotPasswordAsync.and.resolveTo({ ok: false, message: 'E-mail inválido.' });
    component.email = 'jean@example.com';
    await component.submit();
    expect(component.error()).toBe('E-mail inválido.');
  });

  it('falls back to a default error message', async () => {
    auth.forgotPasswordAsync.and.resolveTo({ ok: false });
    component.email = 'jean@example.com';
    await component.submit();
    expect(component.error()).toBe('Não foi possível enviar o e-mail.');
  });
});
