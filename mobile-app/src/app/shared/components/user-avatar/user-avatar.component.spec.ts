import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UserAvatarComponent } from './user-avatar.component';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

describe('UserAvatarComponent', () => {
  let fixture: ComponentFixture<UserAvatarComponent>;
  let component: UserAvatarComponent;
  let http: HttpTestingController;
  let auth: jasmine.SpyObj<Pick<AuthService, 'getToken'>>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj('AuthService', ['getToken']);
    auth.getToken.and.returnValue(null);

    await TestBed.configureTestingModule({
      imports: [UserAvatarComponent, HttpClientTestingModule],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compileComponents();
    fixture = TestBed.createComponent(UserAvatarComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows two-letter initials from a full name', () => {
    fixture.componentRef.setInput('name', 'Jean Lucas');
    fixture.detectChanges();
    expect(component.initials()).toBe('JL');
  });

  it('falls back to "?" when there is no name', () => {
    fixture.detectChanges();
    expect(component.initials()).toBe('?');
  });

  it('uses the first two characters for a single-word name', () => {
    fixture.componentRef.setInput('name', 'Carol');
    fixture.detectChanges();
    expect(component.initials()).toBe('CA');
  });

  it('prefers the user name over the plain name input', () => {
    fixture.componentRef.setInput('user', { id: 1, name: 'Jean Lucas', username: 'jean' });
    fixture.componentRef.setInput('name', 'Fallback');
    fixture.detectChanges();
    expect(component.label()).toBe('Jean Lucas');
  });

  it('does not fetch a photo when the user has no avatarUrl', () => {
    fixture.componentRef.setInput('user', { id: 1, name: 'Jean', username: 'jean' });
    fixture.detectChanges();
    expect(component.photoUrl()).toBeNull();
    http.expectNone(() => true);
  });

  it('does not fetch a photo without an auth token', () => {
    auth.getToken.and.returnValue(null);
    fixture.componentRef.setInput('user', { id: 1, name: 'Jean', username: 'jean', avatarUrl: '/avatars/1.jpg' });
    fixture.detectChanges();
    expect(component.photoUrl()).toBeNull();
    http.expectNone(() => true);
  });

  it('fetches and exposes the avatar blob URL when available', () => {
    auth.getToken.and.returnValue('tok-123');
    fixture.componentRef.setInput('user', { id: 1, name: 'Jean', username: 'jean', avatarUrl: '/avatars/1.jpg' });
    fixture.detectChanges();
    const req = http.expectOne(`${environment.apiUrl}/avatars/1.jpg`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-123');
    req.flush(new Blob(['x'], { type: 'image/png' }));
    expect(component.photoUrl()).toContain('blob:');
  });

  it('clears the photo URL when the fetch fails', () => {
    auth.getToken.and.returnValue('tok-123');
    fixture.componentRef.setInput('user', { id: 1, name: 'Jean', username: 'jean', avatarUrl: '/avatars/1.jpg' });
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/avatars/1.jpg`).flush(null, { status: 404, statusText: 'Not Found' });
    expect(component.photoUrl()).toBeNull();
  });

  it('revokes the object URL on destroy', () => {
    auth.getToken.and.returnValue('tok-123');
    fixture.componentRef.setInput('user', { id: 1, name: 'Jean', username: 'jean', avatarUrl: '/avatars/1.jpg' });
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/avatars/1.jpg`).flush(new Blob(['x'], { type: 'image/png' }));
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('re-fetches when the user input changes to a different avatar', () => {
    auth.getToken.and.returnValue('tok-123');
    fixture.componentRef.setInput('user', { id: 1, name: 'Jean', username: 'jean', avatarUrl: '/avatars/1.jpg' });
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/avatars/1.jpg`).flush(new Blob(['x'], { type: 'image/png' }));

    fixture.componentRef.setInput('user', { id: 2, name: 'Carol', username: 'carol', avatarUrl: '/avatars/2.jpg' });
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/avatars/2.jpg`).flush(new Blob(['y'], { type: 'image/png' }));
    expect(component.photoUrl()).toContain('blob:');
  });
});
