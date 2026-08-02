import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, AlertController } from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';
import { BiometricService } from '../../core/services/biometric.service';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    FormsModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    UserAvatarComponent,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage implements OnInit {
  auth = inject(AuthService);
  biometric = inject(BiometricService);
  private alertCtrl = inject(AlertController);

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

  biometricAvailable = signal(false);
  biometricLabel = signal('biometria');

  constructor() {
    const u = this.auth.user();
    if (u) {
      this.name = u.name;
      this.gender = u.gender;
    }
  }

  async ngOnInit(): Promise<void> {
    const available = await this.biometric.isAvailable();
    this.biometricAvailable.set(available);
    this.biometricLabel.set(this.biometric.labelFor(this.biometric.biometryType()));
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

  private static readonly MAX_AVATAR_BYTES = 500 * 1024 * 1024;

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.avatarError.set('');
    if (file.size > ProfilePage.MAX_AVATAR_BYTES) {
      this.avatarError.set('A foto deve ter no máximo 500 MB.');
      input.value = '';
      return;
    }
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

  async toggleBiometric(): Promise<void> {
    if (this.biometric.isEnabled()) {
      this.biometric.setEnabled(false);
      return;
    }
    const ok = await this.biometric.verify('Confirme para ativar a entrada por biometria');
    if (ok) this.biometric.setEnabled(true);
  }

  async confirmLogout(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Sair',
      message: 'Deseja sair da sua conta?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sair', role: 'destructive', handler: () => this.auth.logout() },
      ],
    });
    await alert.present();
  }
}
