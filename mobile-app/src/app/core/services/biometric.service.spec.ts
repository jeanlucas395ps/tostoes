import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { BiometryType } from 'capacitor-native-biometric';
import { NativeBiometricWeb } from 'capacitor-native-biometric/dist/esm/web';
import { BiometricService } from './biometric.service';
import { StorageService, STORAGE_KEYS } from './storage.service';

describe('BiometricService', () => {
  let storage: jasmine.SpyObj<StorageService>;
  let svc: BiometricService;

  beforeEach(() => {
    storage = jasmine.createSpyObj('StorageService', ['get', 'set']);
    TestBed.configureTestingModule({
      providers: [BiometricService, { provide: StorageService, useValue: storage }],
    });
    svc = TestBed.inject(BiometricService);
  });

  it('isAvailable false on web', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    expect(await svc.isAvailable()).toBe(false);
  });

  it('isAvailable on native', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    spyOn(NativeBiometricWeb.prototype, 'isAvailable').and.resolveTo({
      isAvailable: true,
      biometryType: BiometryType.FACE_ID,
    });
    expect(await svc.isAvailable()).toBe(true);
    expect(svc.biometryType()).toBe(BiometryType.FACE_ID);
  });

  it('isAvailable catches errors', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    spyOn(NativeBiometricWeb.prototype, 'isAvailable').and.rejectWith(new Error('x'));
    expect(await svc.isAvailable()).toBe(false);
  });

  it('enabled flag', () => {
    storage.get.and.returnValue('1');
    expect(svc.isEnabled()).toBe(true);
    svc.setEnabled(true);
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.biometricEnabled, '1');
    svc.setEnabled(false);
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.biometricEnabled, '0');
  });

  it('verify success and failure', async () => {
    spyOn(NativeBiometricWeb.prototype, 'verifyIdentity').and.resolveTo();
    expect(await svc.verify()).toBe(true);
    (NativeBiometricWeb.prototype.verifyIdentity as jasmine.Spy).and.rejectWith(new Error('cancel'));
    expect(await svc.verify()).toBe(false);
  });

  it('verify falls back when unimplemented', async () => {
    expect(await svc.verify()).toBe(false);
  });

  it('labelFor', () => {
    expect(svc.labelFor(BiometryType.FACE_ID)).toBe('Face ID');
    expect(svc.labelFor(BiometryType.FACE_AUTHENTICATION)).toBe('Face ID');
    expect(svc.labelFor(BiometryType.TOUCH_ID)).toBe('Touch ID');
    expect(svc.labelFor(BiometryType.FINGERPRINT)).toContain('impressão');
    expect(svc.labelFor(BiometryType.IRIS_AUTHENTICATION)).toContain('íris');
    expect(svc.labelFor(BiometryType.NONE)).toBe('biometria');
  });
});
