import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';
import { BrandMarkComponent } from '../../shared/components/brand-mark/brand-mark.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, IonContent, IonSpinner, BrandMarkComponent],
  templateUrl: './reset-password.page.html',
  styleUrls: ['../auth-shared.scss'],
})
export class ResetPasswordPage implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  token = '';
  password = '';
  passwordConfirm = '';
  error = signal('');
  success = signal('');
  loading = signal(false);

  ngOnInit(): void {
    this.auth.clearSession();
    this.route.queryParamMap.subscribe((params) => {
      this.token = params.get('token') ?? '';
    });
  }

  async submit(): Promise<void> {
    this.error.set('');
    this.success.set('');
    if (!this.token) {
      this.error.set('Link inválido. Solicite um novo e-mail de recuperação.');
      return;
    }
    if (this.password.length < 8) {
      this.error.set('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (this.password !== this.passwordConfirm) {
      this.error.set('As senhas não coincidem.');
      return;
    }
    this.loading.set(true);
    const result = await this.auth.resetPasswordAsync(this.token, this.password);
    this.loading.set(false);
    if (result.ok) {
      this.success.set(result.message ?? 'Senha redefinida. Redirecionando…');
      setTimeout(() => this.router.navigate(['/login']), 2000);
      return;
    }
    this.error.set(result.message ?? 'Não foi possível redefinir a senha.');
  }
}
