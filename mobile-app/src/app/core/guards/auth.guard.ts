import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AppLockService } from '../services/app-lock.service';
import { map, of, catchError } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  if (auth.user()) {
    return true;
  }
  return auth.loadMe().pipe(
    map((user) => (user ? true : router.createUrlTree(['/login']))),
    catchError(() => {
      auth.clearSession();
      return of(router.createUrlTree(['/login']));
    })
  );
};

/** Só redireciona se já houver sessão válida (evita token velho persistido) */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.user()) {
    return router.createUrlTree(['/home']);
  }
  return true;
};

/** Bloqueia a área logada até a biometria (quando ativada) confirmar a
 * identidade nesta abertura do app. */
export const appLockGuard: CanActivateFn = () => {
  const lock = inject(AppLockService);
  const router = inject(Router);
  if (lock.locked()) {
    return router.createUrlTree(['/desbloquear']);
  }
  return true;
};
