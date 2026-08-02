import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { PlanningService } from './planning.service';
import { StorageService, STORAGE_KEYS } from './storage.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let storage: jasmine.SpyObj<StorageService>;
  let router: jasmine.SpyObj<Router>;
  const base = environment.apiUrl;

  beforeEach(() => {
    storage = jasmine.createSpyObj('StorageService', ['get', 'set', 'remove']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        PlanningService,
        { provide: StorageService, useValue: storage },
        { provide: Router, useValue: router },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('isAuthenticated and getToken', () => {
    storage.get.and.returnValue(null);
    expect(auth.isAuthenticated()).toBe(false);
    storage.get.and.returnValue('t');
    expect(auth.getToken()).toBe('t');
  });

  it('bootstrap without token', async () => {
    storage.get.and.returnValue(null);
    await auth.bootstrap();
    expect(auth.ready()).toBe(true);
  });

  it('loginAsync success', async () => {
    storage.get.and.returnValue(null);
    const p = auth.loginAsync('Ana', 'x');
    const req = http.expectOne(`${base}/auth/login`);
    expect(req.request.body.username).toBe('ana');
    req.flush({
      token: 't1',
      user: { id: 1, username: 'ana', name: 'Ana', gender: 'female' },
      plannings: [{ id: 1, name: 'Casa', role: 'owner', memberCount: 1 }],
      defaultPlanningId: 1,
    });
    expect((await p).ok).toBe(true);
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.token, 't1');
  });

  it('loginAsync error', async () => {
    const p = auth.loginAsync('a', 'b');
    http.expectOne(`${base}/auth/login`).flush({ error: 'X' }, { status: 401, statusText: 'Unauthorized' });
    const res = await p;
    expect(res.ok).toBe(false);
  });

  it('registerAsync and loadMe logout', async () => {
    const p = auth.registerAsync({
      username: 'b',
      password: 'x',
      name: 'B',
      email: 'b@b.com',
    });
    http.expectOne(`${base}/auth/register`).flush({
      token: 't2',
      user: { id: 2, username: 'b', name: 'B', gender: 'male' },
      plannings: [],
    });
    expect((await p).ok).toBe(true);

    storage.get.and.returnValue('t');
    auth.loadMe().subscribe((u) => expect(u?.id).toBe(1));
    http.expectOne(`${base}/auth/me`).flush({
      user: { id: 1, username: 'a', name: 'A', gender: 'male' },
      plannings: [],
    });

    auth.logout();
    expect(storage.remove).toHaveBeenCalledWith(STORAGE_KEYS.token);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('forgot reset profile password avatar', async () => {
    const f = auth.forgotPasswordAsync('a@a.com');
    http.expectOne(`${base}/auth/forgot-password`).flush({ message: 'ok' });
    expect((await f).ok).toBe(true);

    const r = auth.resetPasswordAsync('tok', 'passpass');
    http.expectOne(`${base}/auth/reset-password`).flush({ message: 'ok' });
    expect((await r).ok).toBe(true);

    auth.updateProfile({ name: 'N' }).subscribe((u) => expect(u.name).toBe('N'));
    http.expectOne(`${base}/auth/profile`).flush({
      user: { id: 1, username: 'a', name: 'N', gender: 'male' },
    });

    auth.changePassword('a', 'b').subscribe();
    http.expectOne(`${base}/auth/change-password`).flush({});

    auth.uploadAvatar(new File(['x'], 'a.png')).subscribe();
    http.expectOne(`${base}/auth/avatar`).flush({
      user: { id: 1, username: 'a', name: 'A', gender: 'male' },
    });
  });
});
