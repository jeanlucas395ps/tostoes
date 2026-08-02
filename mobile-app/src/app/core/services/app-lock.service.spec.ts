import { TestBed } from '@angular/core/testing';
import { AppLockService } from './app-lock.service';
import { AuthService } from './auth.service';
import { BiometricService } from './biometric.service';

describe('AppLockService', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let biometric: jasmine.SpyObj<BiometricService>;
  let lock: AppLockService;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    biometric = jasmine.createSpyObj('BiometricService', ['isEnabled', 'isAvailable', 'verify']);
    TestBed.configureTestingModule({
      providers: [
        AppLockService,
        { provide: AuthService, useValue: auth },
        { provide: BiometricService, useValue: biometric },
      ],
    });
    lock = TestBed.inject(AppLockService);
  });

  it('evaluate skips when not authenticated', async () => {
    auth.isAuthenticated.and.returnValue(false);
    await lock.evaluate();
    expect(lock.locked()).toBe(false);
  });

  it('evaluate locks when biometric available', async () => {
    auth.isAuthenticated.and.returnValue(true);
    biometric.isEnabled.and.returnValue(true);
    biometric.isAvailable.and.resolveTo(true);
    await lock.evaluate();
    expect(lock.locked()).toBe(true);
    await lock.evaluate();
  });

  it('unlock and lockAgain', async () => {
    auth.isAuthenticated.and.returnValue(true);
    biometric.isEnabled.and.returnValue(true);
    biometric.isAvailable.and.resolveTo(true);
    await lock.evaluate();
    biometric.verify.and.resolveTo(true);
    expect(await lock.unlock()).toBe(true);
    expect(lock.locked()).toBe(false);
    lock.lockAgain();
    expect(lock.locked()).toBe(true);
  });
});
