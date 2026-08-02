import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';
import { BrandMarkComponent } from '../../shared/components/brand-mark/brand-mark.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink, IonContent, IonSpinner, BrandMarkComponent],
  templateUrl: './forgot-password.page.html',
  styleUrls: ['../auth-shared.scss'],
})
export class ForgotPasswordPage {
  private auth = inject(AuthService);

  email = '';
  error = signal('');
  success = signal('');
  loading = signal(false);

  async submit(): Promise<void> {
    this.error.set('');
    this.success.set('');
    const email = this.email.trim().toLowerCase();
    if (!email) {
      this.error.set('Informe seu e-mail.');
      return;
    }
    this.loading.set(true);
    const result = await this.auth.forgotPasswordAsync(email);
    this.loading.set(false);
    if (result.ok) {
      this.success.set(
        result.message ?? 'Se o e-mail estiver cadastrado, você receberá um link em breve.'
      );
      return;
    }
    this.error.set(result.message ?? 'Não foi possível enviar o e-mail.');
  }
}
