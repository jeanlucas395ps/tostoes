import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { PlanningService } from '../services/planning.service';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const planning = inject(PlanningService);
  const router = inject(Router);
  const token = auth.getToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const planningId = planning.getActiveId();
  if (planningId && !req.url.includes('/auth/login') && !req.url.includes('/auth/register') && !req.url.includes('/invites/')) {
    headers['X-Planning-Id'] = String(planningId);
  }

  const cloned =
    Object.keys(headers).length > 0 ? req.clone({ setHeaders: headers }) : req;

  return next(cloned).pipe(
    catchError((err) => {
      const isAuthRoute =
        req.url.includes('/auth/login') ||
        req.url.includes('/auth/register') ||
        req.url.includes('/auth/me') ||
        req.url.includes('/invites/');
      if (err.status === 401 && !isAuthRoute) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
