import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric, BiometryType } from 'capacitor-native-biometric';
import { StorageService, STORAGE_KEYS } from './storage.service';

/** Gate biométrico local sobre a sessão JWT já emitida — não é um método de
 * autenticação novo no servidor (a API só tem login usuário/senha). Face
 * ID/Touch ID/impressão digital apenas libera o token já guardado. */
@Injectable({ providedIn: 'root' })
export class BiometricService {
  readonly biometryType = signal<BiometryType>(BiometryType.NONE);

  constructor(private storage: StorageService) {}

  async isAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const result = await NativeBiometric.isAvailable();
      this.biometryType.set(result.biometryType);
      return result.isAvailable;
    } catch {
      return false;
    }
  }

  isEnabled(): boolean {
    return this.storage.get(STORAGE_KEYS.biometricEnabled) === '1';
  }

  setEnabled(enabled: boolean): void {
    this.storage.set(STORAGE_KEYS.biometricEnabled, enabled ? '1' : '0');
  }

  async verify(reason = 'Confirme sua identidade para entrar no Tostoes'): Promise<boolean> {
    try {
      await NativeBiometric.verifyIdentity({
        reason,
        title: 'Entrar no Tostoes',
        subtitle: 'Use a biometria do aparelho',
        negativeButtonText: 'Usar senha',
      });
      return true;
    } catch {
      return false;
    }
  }

  labelFor(type: BiometryType): string {
    switch (type) {
      case BiometryType.FACE_ID:
      case BiometryType.FACE_AUTHENTICATION:
        return 'Face ID';
      case BiometryType.TOUCH_ID:
        return 'Touch ID';
      case BiometryType.FINGERPRINT:
        return 'impressão digital';
      case BiometryType.IRIS_AUTHENTICATION:
        return 'reconhecimento de íris';
      default:
        return 'biometria';
    }
  }
}
