import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LucideSvgComponent } from './lucide-svg.component';
import type { IconNode } from 'lucide';

describe('LucideSvgComponent', () => {
  let fixture: ComponentFixture<LucideSvgComponent>;
  let component: LucideSvgComponent;

  const nodes: IconNode = [
    ['path', { d: 'M0 0 L10 10' }],
    ['circle', { cx: '5', cy: '5', r: '3' }],
    ['rect', { x: '0', y: '0', width: '10', height: '10', rx: '2', ry: '2' }],
    ['line', { x1: '0', y1: '0', x2: '10', y2: '10' }],
    ['polyline', { points: '0,0 5,5 10,0' }],
    ['polygon', { points: '0,0 5,5 10,0' }],
    ['ellipse', { cx: '5', cy: '5', rx: '4', ry: '2' }],
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LucideSvgComponent] }).compileComponents();
    fixture = TestBed.createComponent(LucideSvgComponent);
    component = fixture.componentInstance;
    component.nodes = nodes;
  });

  it('defaults to size 16 and stroke-width 1.75', () => {
    fixture.detectChanges();
    expect(component.size).toBe(16);
    expect(component.strokeWidth).toBe(1.75);
  });

  it('renders every supported node shape without throwing', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');
    expect(svg?.querySelector('path')).toBeTruthy();
    expect(svg?.querySelector('circle')).toBeTruthy();
    expect(svg?.querySelector('rect')).toBeTruthy();
    expect(svg?.querySelector('line')).toBeTruthy();
    expect(svg?.querySelector('polyline')).toBeTruthy();
    expect(svg?.querySelector('polygon')).toBeTruthy();
    expect(svg?.querySelector('ellipse')).toBeTruthy();
  });

  it('accepts a custom size', () => {
    component.size = 24;
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
  });

  it('renders an empty svg for an empty node list', () => {
    component.nodes = [];
    expect(() => fixture.detectChanges()).not.toThrow();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');
    expect(svg?.children.length).toBe(0);
  });
});
