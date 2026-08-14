import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { RegisterPage } from './register.page';
import { AuthService } from '../../core/services/auth.service';

describe('RegisterPage', () => {
  let fixture: ComponentFixture<RegisterPage>;
  let component: RegisterPage;
  let auth: jasmine.SpyObj<Pick<AuthService, 'registerAsync'>>;
  let router: jasmine.SpyObj<Router>;

  function build(queryParams: Record<string, string> = {}): void {
    TestBed.resetTestingModule();
    auth = jasmine.createSpyObj('AuthService', ['registerAsync']);
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);

    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap(queryParams)) },
        },
      ],
    })
      .overrideComponent(RegisterPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(RegisterPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => build());

  it('starts with no invite context', () => {
    expect(component.fromInvite).toBeFalse();
    expect(component.inviteToken).toBe('');
  });

  it('picks up invite/email/redirect query params', () => {
    build({ inviteToken: 'abc123', email: 'convidado@example.com', redirect: '/metas' });
    expect(component.fromInvite).toBeTrue();
    expect(component.inviteToken).toBe('abc123');
    expect(component.email).toBe('convidado@example.com');
    expect(component.redirect).toBe('/metas');
  });

  it('requires name, email, username and password', async () => {
    component.name = '';
    await component.submit();
    expect(component.error()).toBe('Preencha nome, e-mail, usuário e senha.');
    expect(auth.registerAsync).not.toHaveBeenCalled();
  });

  it('registers and redirects home by default', async () => {
    auth.registerAsync.and.resolveTo({ ok: true });
    component.name = 'Jean';
    component.email = 'Jean@Example.com';
    component.username = 'Jean.L';
    component.password = 'segredo123';
    component.planningName = '  Casa  ';
    await component.submit();
    expect(auth.registerAsync).toHaveBeenCalledWith({
      name: 'Jean',
      email: 'jean@example.com',
      username: 'jean.l',
      password: 'segredo123',
      planningName: 'Casa',
      inviteToken: undefined,
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
    expect(component.loading()).toBeFalse();
  });

  it('redirects to the provided path and omits planningName when coming from an invite', async () => {
    build({ inviteToken: 'abc123', redirect: '/metas' });
    auth.registerAsync.and.resolveTo({ ok: true });
    component.name = 'Jean';
    component.email = 'jean@example.com';
    component.username = 'jean';
    component.password = 'segredo123';
    await component.submit();
    expect(auth.registerAsync).toHaveBeenCalledWith(
      jasmine.objectContaining({ planningName: undefined, inviteToken: 'abc123' })
    );
    expect(router.navigateByUrl).toHaveBeenCalledWith('/metas');
  });

  it('shows the server error message on failure', async () => {
    auth.registerAsync.and.resolveTo({ ok: false, message: 'Usuário já existe.' });
    component.name = 'Jean';
    component.email = 'jean@example.com';
    component.username = 'jean';
    component.password = 'segredo123';
    await component.submit();
    expect(component.error()).toBe('Usuário já existe.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('falls back to a default error message', async () => {
    auth.registerAsync.and.resolveTo({ ok: false });
    component.name = 'Jean';
    component.email = 'jean@example.com';
    component.username = 'jean';
    component.password = 'segredo123';
    await component.submit();
    expect(component.error()).toBe('Não foi possível criar a conta.');
  });
});
