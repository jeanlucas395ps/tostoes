import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of, throwError } from 'rxjs';
import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  const loginTree = {} as UrlTree;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', [
      'isAuthenticated',
      'user',
      'loadMe',
      'clearSession',
    ]);
    router = jasmine.createSpyObj('Router', ['createUrlTree']);
    router.createUrlTree.and.returnValue(loginTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
  }

  it('redirects to login when not authenticated', () => {
    auth.isAuthenticated.and.returnValue(false);
    expect(runGuard()).toBe(loginTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('returns true when user already loaded', () => {
    auth.isAuthenticated.and.returnValue(true);
    auth.user.and.returnValue({ id: 1, name: 'A', username: 'a' } as never);
    expect(runGuard()).toBe(true);
  });

  it('loads me when authenticated without user', (done) => {
    auth.isAuthenticated.and.returnValue(true);
    auth.user.and.returnValue(null);
    auth.loadMe.and.returnValue(of({ id: 1, name: 'A', username: 'a' } as never));
    const result = runGuard();
    (result as ReturnType<typeof of>).subscribe((v) => {
      expect(v).toBe(true);
      done();
    });
  });

  it('redirects when loadMe returns null', (done) => {
    auth.isAuthenticated.and.returnValue(true);
    auth.user.and.returnValue(null);
    auth.loadMe.and.returnValue(of(null));
    const result = runGuard();
    (result as ReturnType<typeof of>).subscribe((v) => {
      expect(v).toBe(loginTree);
      done();
    });
  });

  it('clears session on loadMe error', (done) => {
    auth.isAuthenticated.and.returnValue(true);
    auth.user.and.returnValue(null);
    auth.loadMe.and.returnValue(throwError(() => new Error('fail')));
    const result = runGuard();
    (result as ReturnType<typeof of>).subscribe((v) => {
      expect(auth.clearSession).toHaveBeenCalled();
      expect(v).toBe(loginTree);
      done();
    });
  });
});

describe('guestGuard', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  const homeTree = {} as UrlTree;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', ['user']);
    router = jasmine.createSpyObj('Router', ['createUrlTree']);
    router.createUrlTree.and.returnValue(homeTree);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
  }

  it('redirects to home when user exists', () => {
    auth.user.and.returnValue({ id: 1 } as never);
    expect(runGuard()).toBe(homeTree);
  });

  it('allows guest when no user', () => {
    auth.user.and.returnValue(null);
    expect(runGuard()).toBe(true);
  });
});
