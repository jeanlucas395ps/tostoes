import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ResetPasswordPage } from './reset-password.page';
import { AuthService } from '../../core/services/auth.service';

describe('ResetPasswordPage', () => {
  let fixture: ComponentFixture<ResetPasswordPage>;
  let component: ResetPasswordPage;
  let auth: jasmine.SpyObj<Pick<AuthService, 'resetPasswordAsync' | 'clearSession'>>;
  let router: jasmine.SpyObj<Router>;

  function build(queryParams: Record<string, string> = { token: 'tok-123' }): void {
    TestBed.resetTestingModule();
    auth = jasmine.createSpyObj('AuthService', ['resetPasswordAsync', 'clearSession']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [ResetPasswordPage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap(queryParams)) },
        },
      ],
    })
      .overrideComponent(ResetPasswordPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(ResetPasswordPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => build());

  it('clears the current session and picks up the token on init', () => {
    expect(auth.clearSession).toHaveBeenCalled();
    expect(component.token).toBe('tok-123');
  });

  it('rejects submission without a token', async () => {
    build({});
    await component.submit();
    expect(component.error()).toContain('Link inválido');
    expect(auth.resetPasswordAsync).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    component.password = '123';
    component.passwordConfirm = '123';
    await component.submit();
    expect(component.error()).toContain('pelo menos 8 caracteres');
  });

  it('rejects mismatched passwords', async () => {
    component.password = 'segredo123';
    component.passwordConfirm = 'outrosegredo';
    await component.submit();
    expect(component.error()).toBe('As senhas não coincidem.');
  });

  it('shows a success message and redirects to login after a delay', fakeAsync(() => {
    auth.resetPasswordAsync.and.resolveTo({ ok: true, message: 'Tudo certo!' });
    component.password = 'segredo123';
    component.passwordConfirm = 'segredo123';
    component.submit();
    tick();
    expect(component.success()).toBe('Tudo certo!');
    expect(component.loading()).toBeFalse();
    expect(router.navigate).not.toHaveBeenCalled();
    tick(2000);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  }));

  it('falls back to a default success message', fakeAsync(() => {
    auth.resetPasswordAsync.and.resolveTo({ ok: true });
    component.password = 'segredo123';
    component.passwordConfirm = 'segredo123';
    component.submit();
    tick();
    expect(component.success()).toContain('Senha redefinida');
    tick(2000);
  }));

  it('shows the server error message on failure', async () => {
    auth.resetPasswordAsync.and.resolveTo({ ok: false, message: 'Link expirado.' });
    component.password = 'segredo123';
    component.passwordConfirm = 'segredo123';
    await component.submit();
    expect(component.error()).toBe('Link expirado.');
  });

  it('falls back to a default error message', async () => {
    auth.resetPasswordAsync.and.resolveTo({ ok: false });
    component.password = 'segredo123';
    component.passwordConfirm = 'segredo123';
    await component.submit();
    expect(component.error()).toBe('Não foi possível redefinir a senha.');
  });
});
