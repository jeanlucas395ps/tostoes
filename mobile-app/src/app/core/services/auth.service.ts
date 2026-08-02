import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, of, Observable, map, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Planning, User } from '../models/api.models';
import { PlanningService } from './planning.service';
import { StorageService, STORAGE_KEYS } from './storage.service';

interface AuthPayload {
  token: string;
  user: User;
  plannings?: Planning[];
  defaultPlanningId?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private planning = inject(PlanningService);
  private storage = inject(StorageService);

  readonly user = signal<User | null>(null);
  readonly loading = signal(false);
  /** true assim que o bootstrap inicial (storage.hydrate + loadMe) terminou */
  readonly ready = signal(false);

  private get base(): string {
    return environment.apiUrl;
  }

  isAuthenticated(): boolean {
    return !!this.storage.get(STORAGE_KEYS.token);
  }

  getToken(): string | null {
    return this.storage.get(STORAGE_KEYS.token);
  }

  /** Chamado uma vez no bootstrap do app (depois de storage.hydrate()). */
  async bootstrap(): Promise<void> {
    if (this.isAuthenticated()) {
      await firstValueFrom(this.loadMe());
    }
    this.ready.set(true);
  }

  loginAsync(username: string, password: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve) => {
      const user = username.trim().toLowerCase();
      this.loading.set(true);
      this.http
        .post<AuthPayload>(`${this.base}/auth/login`, { username: user, password })
        .subscribe({
          next: (res) => {
            this.applySession(res);
            this.loading.set(false);
            resolve({ ok: true });
          },
          error: (err) => {
            this.loading.set(false);
            const msg =
              err.status === 0
                ? 'API indisponível. Confira sua conexão e o endereço configurado.'
                : (err.error?.error ?? `Erro ${err.status} ao entrar.`);
            resolve({ ok: false, message: msg });
          },
        });
    });
  }

  registerAsync(data: {
    username: string;
    password: string;
    name: string;
    email: string;
    gender?: 'male' | 'female';
    planningName?: string;
    inviteToken?: string;
  }): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve) => {
      this.http.post<AuthPayload>(`${this.base}/auth/register`, data).subscribe({
        next: (res) => {
          this.applySession(res);
          resolve({ ok: true });
        },
        error: (err) => {
          const msg =
            err.status === 0 ? 'API indisponível.' : (err.error?.error ?? `Erro ${err.status} ao cadastrar.`);
          resolve({ ok: false, message: msg });
        },
      });
    });
  }

  loadMe(): Observable<User | null> {
    if (!this.isAuthenticated()) {
      return of(null);
    }
    return this.http.get<{ user: User; plannings: Planning[] }>(`${this.base}/auth/me`).pipe(
      tap((r) => {
        this.user.set(r.user);
        this.planning.bootstrapFromAuth(r.plannings ?? []);
      }),
      map((r) => r.user),
      catchError(() => {
        this.clearSession();
        return of(null);
      })
    );
  }

  clearSession(): void {
    this.storage.remove(STORAGE_KEYS.token);
    this.user.set(null);
    this.planning.clear();
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  forgotPasswordAsync(email: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve) => {
      this.http.post<{ message?: string }>(`${this.base}/auth/forgot-password`, { email }).subscribe({
        next: (res) => resolve({ ok: true, message: res.message }),
        error: (err) =>
          resolve({ ok: false, message: err.error?.error ?? 'Não foi possível enviar o e-mail.' }),
      });
    });
  }

  resetPasswordAsync(token: string, password: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve) => {
      this.http
        .post<{ message?: string }>(`${this.base}/auth/reset-password`, { token, password })
        .subscribe({
          next: (res) => resolve({ ok: true, message: res.message }),
          error: (err) =>
            resolve({ ok: false, message: err.error?.error ?? 'Não foi possível redefinir a senha.' }),
        });
    });
  }

  updateProfile(data: { name?: string; gender?: 'male' | 'female' }): Observable<User> {
    return this.http.patch<{ user: User }>(`${this.base}/auth/profile`, data).pipe(
      tap((r) => this.user.set(r.user)),
      map((r) => r.user)
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ message?: string }> {
    return this.http.post<{ message?: string }>(`${this.base}/auth/change-password`, {
      currentPassword,
      newPassword,
    });
  }

  uploadAvatar(file: File): Observable<User> {
    const form = new FormData();
    form.append('avatar', file);
    return this.http.post<{ user: User }>(`${this.base}/auth/avatar`, form).pipe(
      tap((r) => this.user.set(r.user)),
      map((r) => r.user)
    );
  }

  private applySession(res: AuthPayload): void {
    this.storage.set(STORAGE_KEYS.token, res.token);
    this.user.set(res.user);
    this.planning.bootstrapFromAuth(res.plannings ?? [], res.defaultPlanningId);
  }
}
