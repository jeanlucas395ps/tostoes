import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of, throwError } from 'rxjs';
import { appLockGuard, authGuard, guestGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { AppLockService } from '../services/app-lock.service';

describe('authGuard', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  const loginTree = {} as UrlTree;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'user', 'loadMe', 'clearSession']);
    router = jasmine.createSpyObj('Router', ['createUrlTree']);
    router.createUrlTree.and.returnValue(loginTree);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  function run() {
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
  }

  it('redirects when not authenticated', () => {
    auth.isAuthenticated.and.returnValue(false);
    expect(run()).toBe(loginTree);
  });

  it('allows when user loaded', () => {
    auth.isAuthenticated.and.returnValue(true);
    auth.user.and.returnValue({ id: 1 } as never);
    expect(run()).toBe(true);
  });

  it('loads me', (done) => {
    auth.isAuthenticated.and.returnValue(true);
    auth.user.and.returnValue(null);
    auth.loadMe.and.returnValue(of({ id: 1 } as never));
    (run() as ReturnType<typeof of>).subscribe((v) => {
      expect(v).toBe(true);
      done();
    });
  });

  it('clears on error', (done) => {
    auth.isAuthenticated.and.returnValue(true);
    auth.user.and.returnValue(null);
    auth.loadMe.and.returnValue(throwError(() => new Error('x')));
    (run() as ReturnType<typeof of>).subscribe((v) => {
      expect(auth.clearSession).toHaveBeenCalled();
      expect(v).toBe(loginTree);
      done();
    });
  });
});

describe('guestGuard', () => {
  it('redirects logged users', () => {
    const auth = jasmine.createSpyObj('AuthService', ['user']);
    const router = jasmine.createSpyObj('Router', ['createUrlTree']);
    const home = {} as UrlTree;
    router.createUrlTree.and.returnValue(home);
    auth.user.and.returnValue({ id: 1 } as never);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    expect(TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never))).toBe(home);
  });
});

describe('appLockGuard', () => {
  it('blocks when locked', () => {
    const lock = jasmine.createSpyObj('AppLockService', ['locked']);
    const router = jasmine.createSpyObj('Router', ['createUrlTree']);
    const unlock = {} as UrlTree;
    router.createUrlTree.and.returnValue(unlock);
    lock.locked.and.returnValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AppLockService, useValue: lock },
        { provide: Router, useValue: router },
      ],
    });
    expect(TestBed.runInInjectionContext(() => appLockGuard({} as never, {} as never))).toBe(unlock);
  });

  it('allows when unlocked', () => {
    const lock = jasmine.createSpyObj('AppLockService', ['locked']);
    lock.locked.and.returnValue(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: AppLockService, useValue: lock },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['createUrlTree']) },
      ],
    });
    expect(TestBed.runInInjectionContext(() => appLockGuard({} as never, {} as never))).toBe(true);
  });
});
