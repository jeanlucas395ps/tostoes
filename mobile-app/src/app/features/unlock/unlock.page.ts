import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { AppLockService } from '../../core/services/app-lock.service';
import { AuthService } from '../../core/services/auth.service';
import { BiometricService } from '../../core/services/biometric.service';
import { BrandMarkComponent } from '../../shared/components/brand-mark/brand-mark.component';

@Component({
  selector: 'app-unlock',
  standalone: true,
  imports: [IonContent, IonSpinner, BrandMarkComponent],
  templateUrl: './unlock.page.html',
  styleUrls: ['./unlock.page.scss'],
})
export class UnlockPage implements OnInit {
  private lock = inject(AppLockService);
  private auth = inject(AuthService);
  private biometric = inject(BiometricService);
  private router = inject(Router);

  verifying = signal(false);
  failed = signal(false);
  biometryLabel = signal('biometria');

  async ngOnInit(): Promise<void> {
    this.biometryLabel.set(this.biometric.labelFor(this.biometric.biometryType()));
    await this.attempt();
  }

  async attempt(): Promise<void> {
    this.verifying.set(true);
    this.failed.set(false);
    const ok = await this.lock.unlock();
    this.verifying.set(false);
    if (ok) {
      this.router.navigateByUrl('/home');
      return;
    }
    this.failed.set(true);
  }

  useLogout(): void {
    this.auth.logout();
  }
}
