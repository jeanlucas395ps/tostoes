import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { of } from 'rxjs';
import { LoginPage } from './login.page';
import { AuthService } from '../../core/services/auth.service';
import { BiometricService } from '../../core/services/biometric.service';
import { BiometryType } from 'capacitor-native-biometric';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let component: LoginPage;
  let auth: jasmine.SpyObj<Pick<AuthService, 'clearSession' | 'loginAsync'>>;
  let biometric: jasmine.SpyObj<Pick<BiometricService, 'isEnabled' | 'isAvailable' | 'labelFor' | 'biometryType' | 'setEnabled'>>;
  let router: jasmine.SpyObj<Router>;
  let alertCreate: jasmine.Spy;

  function build(queryParams: Record<string, string> = {}): void {
    TestBed.resetTestingModule();
    auth = jasmine.createSpyObj('AuthService', ['clearSession', 'loginAsync']);
    biometric = jasmine.createSpyObj('BiometricService', ['isEnabled', 'isAvailable', 'labelFor', 'biometryType', 'setEnabled']);
    biometric.isEnabled.and.returnValue(true);
    biometric.biometryType.and.returnValue(BiometryType.FACE_ID);
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {}, onDidDismiss: async () => ({}) });
    alertCreate = alertSpy.create;

    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: BiometricService, useValue: biometric },
        { provide: Router, useValue: router },
        { provide: AlertController, useValue: alertSpy },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(queryParams)) } },
      ],
    })
      .overrideComponent(LoginPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => build());

  it('clears the session and reads the redirect query param on init', () => {
    build({ redirect: '/metas' });
    expect(auth.clearSession).toHaveBeenCalled();
    expect(component.redirect).toBe('/metas');
  });

  it('destroys the ambient hero on destroy without throwing', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('requires a username and password', async () => {
    component.user = '';
    component.password = '';
    await component.submit();
    expect(component.error()).toBe('Informe usuário e senha.');
    expect(auth.loginAsync).not.toHaveBeenCalled();
  });

  it('logs in and navigates home by default, skipping the biometric prompt when already enabled', async () => {
    auth.loginAsync.and.resolveTo({ ok: true });
    biometric.isEnabled.and.returnValue(true);
    component.user = ' jean ';
    component.password = 'segredo';
    await component.submit();
    expect(auth.loginAsync).toHaveBeenCalledWith('jean', 'segredo');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
    expect(biometric.isAvailable).not.toHaveBeenCalled();
    expect(component.loading()).toBeFalse();
  });

  it('navigates to the redirect target when provided', async () => {
    build({ redirect: '/metas' });
    auth.loginAsync.and.resolveTo({ ok: true });
    biometric.isEnabled.and.returnValue(true);
    component.user = 'jean';
    component.password = 'segredo';
    await component.submit();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/metas');
  });

  it('offers to enable biometrics after a successful login when available and not yet enabled', async () => {
    auth.loginAsync.and.resolveTo({ ok: true });
    biometric.isEnabled.and.returnValue(false);
    biometric.isAvailable.and.resolveTo(true);
    biometric.labelFor.and.returnValue('Face ID');
    component.user = 'jean';
    component.password = 'segredo';
    await component.submit();
    expect(alertCreate).toHaveBeenCalled();
    const config = alertCreate.calls.mostRecent().args[0];
    expect(config.message).toContain('Face ID');
    const activate = config.buttons.find((b: { text: string }) => b.text === 'Ativar');
    activate.handler();
    expect(biometric.setEnabled).toHaveBeenCalledWith(true);
  });

  it('skips the biometric prompt when unavailable', async () => {
    auth.loginAsync.and.resolveTo({ ok: true });
    biometric.isEnabled.and.returnValue(false);
    biometric.isAvailable.and.resolveTo(false);
    component.user = 'jean';
    component.password = 'segredo';
    await component.submit();
    expect(alertCreate).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalled();
  });

  it('shows the server error message on failed login', async () => {
    auth.loginAsync.and.resolveTo({ ok: false, message: 'Credenciais inválidas.' });
    component.user = 'jean';
    component.password = 'errada';
    await component.submit();
    expect(component.error()).toBe('Credenciais inválidas.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('falls back to a default error message', async () => {
    auth.loginAsync.and.resolveTo({ ok: false });
    component.user = 'jean';
    component.password = 'errada';
    await component.submit();
    expect(component.error()).toBe('Usuário ou senha incorretos.');
  });
});
