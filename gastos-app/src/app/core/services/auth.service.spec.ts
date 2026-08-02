import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { PlanningService } from './planning.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  const base = environment.apiUrl;

  beforeEach(() => {
    localStorage.clear();
    router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        PlanningService,
        { provide: Router, useValue: router },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('isAuthenticated reflects token', () => {
    expect(auth.isAuthenticated()).toBe(false);
    localStorage.setItem('gastos-token', 'x');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getToken()).toBe('x');
  });

  it('loginAsync success applies session', async () => {
    const p = auth.loginAsync('Ana', 'secret');
    const req = http.expectOne(`${base}/auth/login`);
    expect(req.request.body.username).toBe('ana');
    req.flush({
      token: 't1',
      user: { id: 1, username: 'ana', name: 'Ana' },
      plannings: [{ id: 9, name: 'Casa', role: 'owner' }],
      defaultPlanningId: 9,
    });
    const res = await p;
    expect(res.ok).toBe(true);
    expect(localStorage.getItem('gastos-token')).toBe('t1');
    expect(auth.user()?.username).toBe('ana');
  });

  it('loginAsync failure returns message', async () => {
    const p = auth.loginAsync('ana', 'bad');
    http.expectOne(`${base}/auth/login`).flush(
      { error: 'Credenciais inválidas.' },
      { status: 401, statusText: 'Unauthorized' }
    );
    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Credenciais');
  });

  it('loginAsync status 0 shows docker hint', async () => {
    const p = auth.loginAsync('ana', 'x');
    http.expectOne(`${base}/auth/login`).flush(null, { status: 0, statusText: 'Unknown' });
    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Docker');
  });

  it('registerAsync success', async () => {
    const p = auth.registerAsync({
      username: 'bob',
      password: 'x',
      name: 'Bob',
      email: 'b@b.com',
    });
    http.expectOne(`${base}/auth/register`).flush({
      token: 't2',
      user: { id: 2, username: 'bob', name: 'Bob' },
      plannings: [],
    });
    expect((await p).ok).toBe(true);
  });

  it('registerAsync error', async () => {
    const p = auth.registerAsync({
      username: 'bob',
      password: 'x',
      name: 'Bob',
      email: 'b@b.com',
    });
    http.expectOne(`${base}/auth/register`).flush(
      { error: 'Já existe.' },
      { status: 422, statusText: 'Unprocessable' }
    );
    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Já existe');
  });

  it('loadMe returns null when not authenticated', (done) => {
    auth.loadMe().subscribe((u) => {
      expect(u).toBeNull();
      done();
    });
  });

  it('loadMe loads user', (done) => {
    localStorage.setItem('gastos-token', 't');
    auth.loadMe().subscribe((u) => {
      expect(u?.id).toBe(1);
      done();
    });
    http.expectOne(`${base}/auth/me`).flush({
      user: { id: 1, username: 'a', name: 'A' },
      plannings: [{ id: 1, name: 'P', role: 'owner' }],
    });
  });

  it('loadMe logs out on error', (done) => {
    localStorage.setItem('gastos-token', 't');
    auth.loadMe().subscribe((u) => {
      expect(u).toBeNull();
      expect(localStorage.getItem('gastos-token')).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      done();
    });
    http.expectOne(`${base}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
  });

  it('clearSession and logout', () => {
    localStorage.setItem('gastos-token', 't');
    auth.user.set({ id: 1, username: 'a', name: 'A' } as never);
    auth.logout();
    expect(localStorage.getItem('gastos-token')).toBeNull();
    expect(auth.user()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('forgotPasswordAsync and resetPasswordAsync', async () => {
    const f = auth.forgotPasswordAsync('a@a.com');
    http.expectOne(`${base}/auth/forgot-password`).flush({ message: 'ok' });
    expect((await f).ok).toBe(true);

    const r = auth.resetPasswordAsync('tok', 'newpass');
    http.expectOne(`${base}/auth/reset-password`).flush({ message: 'ok' });
    expect((await r).ok).toBe(true);
  });

  it('forgotPasswordAsync error', async () => {
    const f = auth.forgotPasswordAsync('a@a.com');
    http.expectOne(`${base}/auth/forgot-password`).flush(
      { error: 'fail' },
      { status: 400, statusText: 'Bad' }
    );
    expect((await f).ok).toBe(false);
  });

  it('updateProfile, changePassword, uploadAvatar', () => {
    auth.updateProfile({ name: 'Novo' }).subscribe((u) => expect(u.name).toBe('Novo'));
    const p = http.expectOne(`${base}/auth/profile`);
    expect(p.request.method).toBe('PATCH');
    p.flush({ user: { id: 1, username: 'a', name: 'Novo' } });

    auth.changePassword('old', 'new').subscribe();
    http.expectOne(`${base}/auth/change-password`).flush({ message: 'ok' });

    auth.uploadAvatar(new File(['x'], 'a.png')).subscribe((u) => expect(u.id).toBe(1));
    const a = http.expectOne(`${base}/auth/avatar`);
    expect(a.request.method).toBe('POST');
    a.flush({ user: { id: 1, username: 'a', name: 'A' } });
  });
});
