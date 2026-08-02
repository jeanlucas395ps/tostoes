import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
  HttpResponse,
  HttpEvent,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { PlanningService } from '../services/planning.service';

describe('authInterceptor', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let planning: jasmine.SpyObj<PlanningService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', ['getToken', 'logout']);
    planning = jasmine.createSpyObj('PlanningService', ['getActiveId']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PlanningService, useValue: planning },
        { provide: Router, useValue: router },
      ],
    });
  });

  function run(req: HttpRequest<unknown>, next: HttpHandlerFn) {
    return TestBed.runInInjectionContext(() =>
      (authInterceptor as HttpInterceptorFn)(req, next)
    );
  }

  function ok(): Observable<HttpEvent<unknown>> {
    return of(new HttpResponse({ status: 200, body: {} }));
  }

  it('adds Authorization and X-Planning-Id', (done) => {
    auth.getToken.and.returnValue('tok');
    planning.getActiveId.and.returnValue(7);
    const req = new HttpRequest('GET', '/api/accounts');
    run(req, (r) => {
      expect(r.headers.get('Authorization')).toBe('Bearer tok');
      expect(r.headers.get('X-Planning-Id')).toBe('7');
      return ok();
    }).subscribe(() => done());
  });

  it('skips planning header on login', (done) => {
    auth.getToken.and.returnValue('tok');
    planning.getActiveId.and.returnValue(7);
    const req = new HttpRequest('POST', '/api/auth/login', {});
    run(req, (r) => {
      expect(r.headers.get('Authorization')).toBe('Bearer tok');
      expect(r.headers.get('X-Planning-Id')).toBeNull();
      return ok();
    }).subscribe(() => done());
  });

  it('logs out on 401 outside auth routes', (done) => {
    auth.getToken.and.returnValue(null);
    planning.getActiveId.and.returnValue(null);
    const req = new HttpRequest('GET', '/api/accounts');
    run(req, () =>
      throwError(() => new HttpErrorResponse({ status: 401, url: '/api/accounts' }))
    ).subscribe({
      error: () => {
        expect(auth.logout).toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(['/login']);
        done();
      },
    });
  });

  it('does not logout on 401 for /auth/me', (done) => {
    auth.getToken.and.returnValue(null);
    planning.getActiveId.and.returnValue(null);
    const req = new HttpRequest('GET', '/api/auth/me');
    run(req, () => throwError(() => new HttpErrorResponse({ status: 401 }))).subscribe({
      error: () => {
        expect(auth.logout).not.toHaveBeenCalled();
        done();
      },
    });
  });
});