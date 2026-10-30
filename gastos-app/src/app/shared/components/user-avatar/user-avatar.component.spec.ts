import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { UserAvatarComponent } from './user-avatar.component';
import { AuthService } from '../../../core/services/auth.service';
import { PlanningService } from '../../../core/services/planning.service';
import { environment } from '../../../../environments/environment';

describe('UserAvatarComponent', () => {
  let fixture: ComponentFixture<UserAvatarComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:avatar');
    spyOn(URL, 'revokeObjectURL');
    TestBed.configureTestingModule({
      imports: [UserAvatarComponent, HttpClientTestingModule],
      providers: [
        AuthService,
        PlanningService,
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
      ],
    });
    fixture = TestBed.createComponent(UserAvatarComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('shows initials for one name, two names and an empty label', () => {
    fixture.componentRef.setInput('name', 'ana');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('AN');
    fixture.componentRef.setInput('user', { id: 1, username: 'ana', name: 'Ana Silva', gender: 'female' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('AS');
    fixture.componentRef.setInput('user', null);
    fixture.componentRef.setInput('name', '   ');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('?');
    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sm')).toBeTruthy();
  });

  it('loads a photo when the user has an avatar and a token, and clears it on error', () => {
    localStorage.setItem('gastos-token', 'tok');
    fixture.componentRef.setInput('user', {
      id: 1,
      username: 'ana',
      name: 'Ana',
      gender: 'female',
      avatarUrl: '/uploads/a.png',
    });
    fixture.detectChanges();
    const req = http.expectOne(`${environment.apiUrl}/uploads/a.png`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush(new Blob(['x'], { type: 'image/png' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:avatar');
    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('skips the request without a token or an avatar path', () => {
    fixture.componentRef.setInput('user', {
      id: 1,
      username: 'ana',
      name: 'Ana',
      gender: 'female',
      avatarUrl: '/uploads/a.png',
    });
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(fixture.componentInstance.photoUrl()).toBeNull();

    localStorage.setItem('gastos-token', 'tok');
    fixture.componentRef.setInput('user', {
      id: 2,
      username: 'ana',
      name: 'Ana',
      gender: 'female',
      avatarUrl: '/uploads/b.png',
    });
    fixture.detectChanges();
    http
      .expectOne(`${environment.apiUrl}/uploads/b.png`)
      .flush(new Blob(), { status: 404, statusText: 'no' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
