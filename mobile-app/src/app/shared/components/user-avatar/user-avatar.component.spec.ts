import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  let fixture: ComponentFixture<UserAvatarComponent>;
  let component: UserAvatarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserAvatarComponent, HttpClientTestingModule],
    }).compileComponents();
    fixture = TestBed.createComponent(UserAvatarComponent);
    component = fixture.componentInstance;
  });

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
});
