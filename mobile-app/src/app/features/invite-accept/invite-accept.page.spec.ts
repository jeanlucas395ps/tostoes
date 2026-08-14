import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InviteAcceptPage } from './invite-accept.page';
import { PlanningService } from '../../core/services/planning.service';
import { AuthService } from '../../core/services/auth.service';
import { PlanningInvitePreview } from '../../core/models/api.models';

describe('InviteAcceptPage', () => {
  let fixture: ComponentFixture<InviteAcceptPage>;
  let component: InviteAcceptPage;
  let planning: jasmine.SpyObj<Pick<PlanningService, 'getInvite' | 'acceptInvite'>>;
  let auth: jasmine.SpyObj<Pick<AuthService, 'isAuthenticated'>>;
  let router: jasmine.SpyObj<Router>;

  const pendingInvite: PlanningInvitePreview = {
    token: 'tok-1',
    email: 'convidado@example.com',
    status: 'pending',
    expiresAt: '2026-12-01',
    planningId: 5,
    planningName: 'Casa',
    inviterName: 'Jean',
    expired: false,
  };

  function build(opts: { token?: string; authenticated?: boolean } = {}): void {
    TestBed.resetTestingModule();
    planning = jasmine.createSpyObj('PlanningService', ['getInvite', 'acceptInvite']);
    auth = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    auth.isAuthenticated.and.returnValue(opts.authenticated ?? false);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [InviteAcceptPage],
      providers: [
        { provide: PlanningService, useValue: planning },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(opts.token === undefined ? { token: 'tok-1' } : { token: opts.token }) } },
        },
      ],
    })
      .overrideComponent(InviteAcceptPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(InviteAcceptPage);
    component = fixture.componentInstance;
  }

  it('shows an error when no token is present in the route', () => {
    build({ token: '' });
    fixture.detectChanges();
    expect(component.error()).toBe('Convite inválido.');
    expect(component.loading()).toBeFalse();
    expect(planning.getInvite).not.toHaveBeenCalled();
  });

  it('loads the invite and leaves it pending for an unauthenticated visitor', () => {
    build({ authenticated: false });
    planning.getInvite.and.returnValue(of(pendingInvite));
    fixture.detectChanges();
    expect(component.invite()).toEqual(pendingInvite);
    expect(component.isPending()).toBeTrue();
    expect(component.loading()).toBeFalse();
    expect(planning.acceptInvite).not.toHaveBeenCalled();
  });

  it('auto-accepts a pending invite for an authenticated visitor', () => {
    build({ authenticated: true });
    planning.getInvite.and.returnValue(of(pendingInvite));
    planning.acceptInvite.and.returnValue(of({ planningId: 5, planningName: 'Casa', plannings: [], message: 'Bem-vindo!' }));
    fixture.detectChanges();
    expect(planning.acceptInvite).toHaveBeenCalledWith('tok-1');
    expect(component.done()).toBeTrue();
    expect(component.doneMessage()).toBe('Bem-vindo!');
  });

  it('marks an already-accepted invite as done', () => {
    build();
    planning.getInvite.and.returnValue(of({ ...pendingInvite, status: 'accepted' }));
    fixture.detectChanges();
    expect(component.done()).toBeTrue();
    expect(component.doneMessage()).toBe('Este convite já foi aceito.');
  });

  it('shows an error for an expired invite', () => {
    build();
    planning.getInvite.and.returnValue(of({ ...pendingInvite, expired: true }));
    fixture.detectChanges();
    expect(component.error()).toContain('expirou');
  });

  it('surfaces the server error when the invite cannot be found', () => {
    build();
    planning.getInvite.and.returnValue(throwError(() => ({ error: { error: 'Convite não encontrado.' } })));
    fixture.detectChanges();
    expect(component.error()).toBe('Convite não encontrado.');
    expect(component.loading()).toBeFalse();
  });

  describe('tryAccept', () => {
    beforeEach(() => {
      build({ authenticated: false });
      planning.getInvite.and.returnValue(of(pendingInvite));
      fixture.detectChanges();
    });

    it('does nothing when the invite is not pending', () => {
      component.invite.set({ ...pendingInvite, status: 'accepted' });
      component.tryAccept();
      expect(planning.acceptInvite).not.toHaveBeenCalled();
    });

    it('accepts the invite and redirects home after a delay', fakeAsync(() => {
      planning.acceptInvite.and.returnValue(of({ planningId: 5, planningName: 'Casa', plannings: [], message: 'Feito!' }));
      component.tryAccept();
      expect(component.accepting()).toBeFalse();
      expect(component.done()).toBeTrue();
      tick(1200);
      expect(router.navigate).toHaveBeenCalledWith(['/home']);
    }));

    it('redirects to login on a 401 error', () => {
      planning.acceptInvite.and.returnValue(throwError(() => ({ status: 401, error: {} })));
      component.tryAccept();
      expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { redirect: '/convite/tok-1' } });
      expect(component.error()).toBe('');
    });

    it('surfaces a generic error otherwise', () => {
      planning.acceptInvite.and.returnValue(throwError(() => ({ status: 500, error: { error: 'Falhou.' } })));
      component.tryAccept();
      expect(component.error()).toBe('Falhou.');
      expect(component.accepting()).toBeFalse();
    });

    it('falls back to a default error message', () => {
      planning.acceptInvite.and.returnValue(throwError(() => ({ status: 500, error: {} })));
      component.tryAccept();
      expect(component.error()).toBe('Não foi possível aceitar o convite.');
    });
  });

  it('builds login and register query params with the invite context', () => {
    build();
    planning.getInvite.and.returnValue(of(pendingInvite));
    fixture.detectChanges();
    expect(component.loginQueryParams()).toEqual({ redirect: '/convite/tok-1' });
    expect(component.registerQueryParams()).toEqual({
      redirect: '/convite/tok-1',
      inviteToken: 'tok-1',
      email: 'convidado@example.com',
    });
  });
});
