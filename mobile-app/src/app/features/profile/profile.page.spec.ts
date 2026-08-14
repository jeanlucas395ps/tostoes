import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { of, throwError } from 'rxjs';
import { ProfilePage } from './profile.page';
import { AuthService } from '../../core/services/auth.service';
import { BiometricService } from '../../core/services/biometric.service';
import { User } from '../../core/models/api.models';

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let component: ProfilePage;
  let auth: {
    user: ReturnType<typeof signal<User | null>>;
    updateProfile: jasmine.Spy;
    changePassword: jasmine.Spy;
    uploadAvatar: jasmine.Spy;
    logout: jasmine.Spy;
  };
  let biometric: jasmine.SpyObj<
    Pick<BiometricService, 'isAvailable' | 'labelFor' | 'biometryType' | 'isEnabled' | 'setEnabled' | 'verify'>
  >;
  let alertCreate: jasmine.Spy;

  const user: User = { id: 1, name: 'Jean', username: 'jean', email: 'jean@example.com', gender: 'male' } as User;

  function build(initialUser: User | null = user): void {
    TestBed.resetTestingModule();
    auth = {
      user: signal<User | null>(initialUser),
      updateProfile: jasmine.createSpy('updateProfile'),
      changePassword: jasmine.createSpy('changePassword'),
      uploadAvatar: jasmine.createSpy('uploadAvatar'),
      logout: jasmine.createSpy('logout'),
    };
    biometric = jasmine.createSpyObj('BiometricService', ['isAvailable', 'labelFor', 'biometryType', 'isEnabled', 'setEnabled', 'verify']);
    biometric.isAvailable.and.resolveTo(true);
    biometric.labelFor.and.returnValue('Face ID');
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {} });
    alertCreate = alertSpy.create;

    TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: BiometricService, useValue: biometric },
        { provide: AlertController, useValue: alertSpy },
      ],
    })
      .overrideComponent(ProfilePage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(ProfilePage);
    component = fixture.componentInstance;
  }

  beforeEach(() => build());

  it('preloads name and gender from the current user', () => {
    fixture.detectChanges();
    expect(component.name).toBe('Jean');
    expect(component.gender).toBe('male');
  });

  it('leaves defaults when there is no logged-in user', () => {
    build(null);
    fixture.detectChanges();
    expect(component.name).toBe('');
    expect(component.gender).toBe('male');
  });

  it('detects biometric availability and label on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.biometricAvailable()).toBeTrue();
    expect(component.biometricLabel()).toBe('Face ID');
  });

  describe('saveProfile', () => {
    beforeEach(() => fixture.detectChanges());

    it('requires a name', () => {
      component.name = '  ';
      component.saveProfile();
      expect(component.profileError()).toBe('Informe seu nome.');
      expect(auth.updateProfile).not.toHaveBeenCalled();
    });

    it('saves the profile successfully', () => {
      auth.updateProfile.and.returnValue(of(user));
      component.name = ' Jean Lucas ';
      component.gender = 'male';
      component.saveProfile();
      expect(auth.updateProfile).toHaveBeenCalledWith({ name: 'Jean Lucas', gender: 'male' });
      expect(component.profileSuccess()).toBe('Perfil atualizado.');
      expect(component.savingProfile()).toBeFalse();
    });

    it('surfaces the server error message on failure', () => {
      auth.updateProfile.and.returnValue(throwError(() => ({ error: { error: 'Nome inválido.' } })));
      component.name = 'Jean';
      component.saveProfile();
      expect(component.profileError()).toBe('Nome inválido.');
    });

    it('falls back to a default error message', () => {
      auth.updateProfile.and.returnValue(throwError(() => ({})));
      component.name = 'Jean';
      component.saveProfile();
      expect(component.profileError()).toBe('Não foi possível salvar.');
    });
  });

  describe('changePassword', () => {
    beforeEach(() => fixture.detectChanges());

    it('requires at least 8 characters', () => {
      component.newPassword = '123';
      component.newPasswordConfirm = '123';
      component.changePassword();
      expect(component.passwordError()).toContain('mínimo 8 caracteres');
      expect(auth.changePassword).not.toHaveBeenCalled();
    });

    it('requires matching passwords', () => {
      component.newPassword = 'segredo123';
      component.newPasswordConfirm = 'outrosegredo';
      component.changePassword();
      expect(component.passwordError()).toBe('As senhas não coincidem.');
    });

    it('changes the password and clears the fields', () => {
      auth.changePassword.and.returnValue(of({ message: 'Alterada!' }));
      component.currentPassword = 'antiga';
      component.newPassword = 'segredo123';
      component.newPasswordConfirm = 'segredo123';
      component.changePassword();
      expect(auth.changePassword).toHaveBeenCalledWith('antiga', 'segredo123');
      expect(component.passwordSuccess()).toBe('Alterada!');
      expect(component.currentPassword).toBe('');
      expect(component.newPassword).toBe('');
      expect(component.newPasswordConfirm).toBe('');
    });

    it('falls back to a default success message', () => {
      auth.changePassword.and.returnValue(of({}));
      component.newPassword = 'segredo123';
      component.newPasswordConfirm = 'segredo123';
      component.changePassword();
      expect(component.passwordSuccess()).toBe('Senha alterada.');
    });

    it('surfaces the server error message on failure', () => {
      auth.changePassword.and.returnValue(throwError(() => ({ error: { error: 'Senha atual incorreta.' } })));
      component.newPassword = 'segredo123';
      component.newPasswordConfirm = 'segredo123';
      component.changePassword();
      expect(component.passwordError()).toBe('Senha atual incorreta.');
      expect(component.savingPassword()).toBeFalse();
    });
  });

  describe('onAvatarSelected', () => {
    beforeEach(() => fixture.detectChanges());

    function eventWithFile(file: File | undefined): Event {
      const input = { files: file ? [file] : [], value: 'x' } as unknown as HTMLInputElement;
      return { target: input } as unknown as Event;
    }

    it('does nothing when no file was selected', () => {
      component.onAvatarSelected(eventWithFile(undefined));
      expect(auth.uploadAvatar).not.toHaveBeenCalled();
    });

    it('rejects files larger than 500MB', () => {
      const big = new File([new Uint8Array(10)], 'foto.png', { type: 'image/png' });
      Object.defineProperty(big, 'size', { value: 500 * 1024 * 1024 + 1 });
      const evt = eventWithFile(big);
      component.onAvatarSelected(evt);
      expect(component.avatarError()).toContain('500 MB');
      expect((evt.target as HTMLInputElement).value).toBe('');
      expect(auth.uploadAvatar).not.toHaveBeenCalled();
    });

    it('uploads a valid avatar', () => {
      auth.uploadAvatar.and.returnValue(of(user));
      const file = new File([new Uint8Array(10)], 'foto.png', { type: 'image/png' });
      component.onAvatarSelected(eventWithFile(file));
      expect(auth.uploadAvatar).toHaveBeenCalledWith(file);
      expect(component.uploadingAvatar()).toBeFalse();
    });

    it('surfaces the server error message when the upload fails', () => {
      auth.uploadAvatar.and.returnValue(throwError(() => ({ error: { error: 'Falha no servidor.' } })));
      const file = new File([new Uint8Array(10)], 'foto.png', { type: 'image/png' });
      component.onAvatarSelected(eventWithFile(file));
      expect(component.avatarError()).toBe('Falha no servidor.');
      expect(component.uploadingAvatar()).toBeFalse();
    });

    it('falls back to a default upload error message', () => {
      auth.uploadAvatar.and.returnValue(throwError(() => ({})));
      const file = new File([new Uint8Array(10)], 'foto.png', { type: 'image/png' });
      component.onAvatarSelected(eventWithFile(file));
      expect(component.avatarError()).toBe('Falha no upload.');
    });
  });

  describe('toggleBiometric', () => {
    beforeEach(() => fixture.detectChanges());

    it('disables biometrics when currently enabled', async () => {
      biometric.isEnabled.and.returnValue(true);
      await component.toggleBiometric();
      expect(biometric.setEnabled).toHaveBeenCalledWith(false);
      expect(biometric.verify).not.toHaveBeenCalled();
    });

    it('verifies before enabling biometrics', async () => {
      biometric.isEnabled.and.returnValue(false);
      biometric.verify.and.resolveTo(true);
      await component.toggleBiometric();
      expect(biometric.setEnabled).toHaveBeenCalledWith(true);
    });

    it('does not enable biometrics when verification fails', async () => {
      biometric.isEnabled.and.returnValue(false);
      biometric.verify.and.resolveTo(false);
      await component.toggleBiometric();
      expect(biometric.setEnabled).not.toHaveBeenCalled();
    });
  });

  it('confirms and logs out', async () => {
    fixture.detectChanges();
    await component.confirmLogout();
    const config = alertCreate.calls.mostRecent().args[0];
    const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
    destructive.handler();
    expect(auth.logout).toHaveBeenCalled();
  });
});
