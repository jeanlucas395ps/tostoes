import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  redirect = '';

  ngOnInit(): void {
    this.auth.clearSession();
    this.route.queryParamMap.subscribe((params) => {
      this.redirect = params.get('redirect') ?? '';
    });
  }

  user = '';
  password = '';
  error = signal('');
  loading = signal(false);

  readonly dots = Array(24).fill(0).map((_, i) => i);

  async submit(): Promise<void> {
    this.error.set('');
    const username = this.user.trim();
    if (!username || !this.password) {
      this.error.set('Informe usuário e senha.');
      return;
    }
    this.loading.set(true);
    const result = await this.auth.loginAsync(username, this.password);
    this.loading.set(false);
    if (result.ok) {
      this.router.navigateByUrl(this.redirect || '/home');
      return;
    }
    this.error.set(result.message ?? 'Usuário ou senha incorretos.');
  }
}
