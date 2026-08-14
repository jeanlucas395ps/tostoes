import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonComponent } from './skeleton.component';

describe('SkeletonComponent', () => {
  let fixture: ComponentFixture<SkeletonComponent>;
  let component: SkeletonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SkeletonComponent] }).compileComponents();
    fixture = TestBed.createComponent(SkeletonComponent);
    component = fixture.componentInstance;
  });

  it('defaults to a list variant with 3 items', () => {
    fixture.detectChanges();
    expect(component.variant()).toBe('list');
    expect(component.items()).toEqual([0, 1, 2]);
  });

  it('builds an items array matching the requested count', () => {
    fixture.componentRef.setInput('count', 5);
    fixture.detectChanges();
    expect(component.items()).toEqual([0, 1, 2, 3, 4]);
  });

  it('clamps the item count to at least 1', () => {
    fixture.componentRef.setInput('count', 0);
    fixture.detectChanges();
    expect(component.items()).toEqual([0]);
  });

  it('accepts a custom variant and label', () => {
    fixture.componentRef.setInput('variant', 'cards');
    fixture.componentRef.setInput('label', 'Buscando...');
    fixture.detectChanges();
    expect(component.variant()).toBe('cards');
    expect(component.label()).toBe('Buscando...');
  });
});
