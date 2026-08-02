import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
} from '@angular/common/http/testing';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
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

  it('adds headers', (done) => {
    auth.getToken.and.returnValue('tok');
    planning.getActiveId.and.returnValue(7);
    run(new HttpRequest('GET', '/api/accounts'), (r) => {
      expect(r.headers.get('Authorization')).toBe('Bearer tok');
      expect(r.headers.get('X-Planning-Id')).toBe('7');
      return ok();
    }).subscribe(() => done());
  });

  it('logs out on 401', (done) => {
    auth.getToken.and.returnValue(null);
    planning.getActiveId.and.returnValue(null);
    run(new HttpRequest('GET', '/api/accounts'), () =>
      throwError(() => new HttpErrorResponse({ status: 401 }))
    ).subscribe({
      error: () => {
        expect(auth.logout).toHaveBeenCalled();
        done();
      },
    });
  });
});
