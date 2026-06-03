import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, UserAvatarComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  auth = inject(AuthService);

  name = '';
  gender: 'male' | 'female' = 'male';
  currentPassword = '';
  newPassword = '';
  newPasswordConfirm = '';

  profileError = signal('');
  profileSuccess = signal('');
  passwordError = signal('');
  passwordSuccess = signal('');
  avatarError = signal('');
  savingProfile = signal(false);
  savingPassword = signal(false);
  uploadingAvatar = signal(false);

  constructor() {
    const u = this.auth.user();
    if (u) {
      this.name = u.name;
      this.gender = u.gender;
    }
  }

  saveProfile(): void {
    this.profileError.set('');
    this.profileSuccess.set('');
    if (!this.name.trim()) {
      this.profileError.set('Informe seu nome.');
      return;
    }
    this.savingProfile.set(true);
    this.auth.updateProfile({ name: this.name.trim(), gender: this.gender }).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.profileSuccess.set('Perfil atualizado.');
      },
      error: (err) => {
        this.savingProfile.set(false);
        this.profileError.set(err.error?.error ?? 'Não foi possível salvar.');
      },
    });
  }

  changePassword(): void {
    this.passwordError.set('');
    this.passwordSuccess.set('');
    if (this.newPassword.length < 8) {
      this.passwordError.set('Nova senha: mínimo 8 caracteres.');
      return;
    }
    if (this.newPassword !== this.newPasswordConfirm) {
      this.passwordError.set('As senhas não coincidem.');
      return;
    }
    this.savingPassword.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: (res) => {
        this.savingPassword.set(false);
        this.passwordSuccess.set(res.message ?? 'Senha alterada.');
        this.currentPassword = '';
        this.newPassword = '';
        this.newPasswordConfirm = '';
      },
      error: (err) => {
        this.savingPassword.set(false);
        this.passwordError.set(err.error?.error ?? 'Não foi possível alterar a senha.');
      },
    });
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.avatarError.set('');
    this.uploadingAvatar.set(true);
    this.auth.uploadAvatar(file).subscribe({
      next: () => {
        this.uploadingAvatar.set(false);
        input.value = '';
      },
      error: (err) => {
        this.uploadingAvatar.set(false);
        this.avatarError.set(err.error?.error ?? 'Falha no upload.');
        input.value = '';
      },
    });
  }
}
