import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = '';
  email = '';
  username = '';
  password = '';
  planningName = '';
  inviteToken = '';
  redirect = '';
  fromInvite = false;
  error = signal('');
  loading = signal(false);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.inviteToken = params.get('inviteToken') ?? '';
      this.email = params.get('email') ?? this.email;
      this.redirect = params.get('redirect') ?? '';
      this.fromInvite = !!this.inviteToken;
    });
  }

  async submit(): Promise<void> {
    this.error.set('');
    if (!this.name.trim() || !this.username.trim() || !this.password || !this.email.trim()) {
      this.error.set('Preencha nome, e-mail, usuário e senha.');
      return;
    }
    this.loading.set(true);
    const result = await this.auth.registerAsync({
      name: this.name.trim(),
      email: this.email.trim().toLowerCase(),
      username: this.username.trim().toLowerCase(),
      password: this.password,
      planningName: this.fromInvite ? undefined : this.planningName.trim() || undefined,
      inviteToken: this.inviteToken || undefined,
    });
    this.loading.set(false);
    if (result.ok) {
      const target = this.redirect || '/home';
      this.router.navigateByUrl(target);
      return;
    }
    this.error.set(result.message ?? 'Não foi possível criar a conta.');
  }
}
