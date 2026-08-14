import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UnlockPage } from './unlock.page';
import { AppLockService } from '../../core/services/app-lock.service';
import { AuthService } from '../../core/services/auth.service';
import { BiometricService } from '../../core/services/biometric.service';
import { BiometryType } from 'capacitor-native-biometric';

describe('UnlockPage', () => {
  let fixture: ComponentFixture<UnlockPage>;
  let component: UnlockPage;
  let lock: jasmine.SpyObj<Pick<AppLockService, 'unlock'>>;
  let auth: jasmine.SpyObj<Pick<AuthService, 'logout'>>;
  let biometric: { labelFor: jasmine.Spy; biometryType: jasmine.Spy };
  let router: jasmine.SpyObj<Router>;

  function build(): void {
    fixture = TestBed.createComponent(UnlockPage);
    component = fixture.componentInstance;
  }

  beforeEach(async () => {
    lock = jasmine.createSpyObj('AppLockService', ['unlock']);
    auth = jasmine.createSpyObj('AuthService', ['logout']);
    biometric = {
      labelFor: jasmine.createSpy('labelFor').and.returnValue('Face ID'),
      biometryType: jasmine.createSpy('biometryType').and.returnValue(BiometryType.FACE_ID),
    };
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);

    await TestBed.configureTestingModule({
      imports: [UnlockPage],
      providers: [
        { provide: AppLockService, useValue: lock },
        { provide: AuthService, useValue: auth },
        { provide: BiometricService, useValue: biometric },
        { provide: Router, useValue: router },
      ],
    })
      .overrideComponent(UnlockPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
  });

  it('sets the biometry label and navigates home on a successful unlock', async () => {
    lock.unlock.and.resolveTo(true);
    build();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.biometryLabel()).toBe('Face ID');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
    expect(component.verifying()).toBeFalse();
    expect(component.failed()).toBeFalse();
  });

  it('marks the attempt as failed when unlock fails', async () => {
    lock.unlock.and.resolveTo(false);
    build();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.failed()).toBeTrue();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('can retry after a failed attempt', async () => {
    lock.unlock.and.resolveTo(false);
    build();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.failed()).toBeTrue();

    lock.unlock.and.resolveTo(true);
    await component.attempt();
    expect(component.failed()).toBeFalse();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('logs out via useLogout', async () => {
    lock.unlock.and.resolveTo(true);
    build();
    fixture.detectChanges();
    await fixture.whenStable();
    component.useLogout();
    expect(auth.logout).toHaveBeenCalled();
  });
});
