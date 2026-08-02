import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrandMarkComponent } from './brand-mark.component';

describe('BrandMarkComponent', () => {
  let fixture: ComponentFixture<BrandMarkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandMarkComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(BrandMarkComponent);
    fixture.detectChanges();
  });

  it('renders the cifrao svg', () => {
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
  });

  it('applies light variant class', () => {
    fixture.componentRef.setInput('variant', 'light');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brand-mark--light')).toBeTruthy();
  });
});
