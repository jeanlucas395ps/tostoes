import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonComponent, SkeletonVariant } from './skeleton.component';

describe('SkeletonComponent', () => {
  let fixture: ComponentFixture<SkeletonComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SkeletonComponent] });
    fixture = TestBed.createComponent(SkeletonComponent);
  });

  it('clamps a zero count and renders every variant', () => {
    fixture.componentRef.setInput('count', 0);
    fixture.detectChanges();
    expect(fixture.componentInstance.items()).toEqual([0]);

    const variants: SkeletonVariant[] = ['kpi', 'totals', 'list', 'cards', 'rows', 'page', 'detail', 'form'];
    for (const variant of variants) {
      fixture.componentRef.setInput('variant', variant);
      fixture.componentRef.setInput('count', 2);
      fixture.componentRef.setInput('label', variant);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-variant]')?.getAttribute('data-variant')).toBe(variant);
    }
  });
});
