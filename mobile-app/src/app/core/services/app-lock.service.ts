import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { BiometricService } from './biometric.service';

/** Controla o gate biométrico sobre uma sessão já autenticada (JWT já salvo). */
@Injectable({ providedIn: 'root' })
export class AppLockService {
  private auth = inject(AuthService);
  private biometric = inject(BiometricService);

  readonly locked = signal(false);
  private evaluated = false;

  /** Chamado uma vez no bootstrap, depois de auth.bootstrap(). */
  async evaluate(): Promise<void> {
    if (this.evaluated) return;
    this.evaluated = true;
    if (!this.auth.isAuthenticated() || !this.biometric.isEnabled()) {
      return;
    }
    const available = await this.biometric.isAvailable();
    if (available) {
      this.locked.set(true);
    }
  }

  async unlock(): Promise<boolean> {
    const ok = await this.biometric.verify();
    if (ok) this.locked.set(false);
    return ok;
  }

  lockAgain(): void {
    if (this.auth.isAuthenticated() && this.biometric.isEnabled()) {
      this.locked.set(true);
    }
  }
}
