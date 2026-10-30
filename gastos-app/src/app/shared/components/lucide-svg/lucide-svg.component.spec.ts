import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LucideSvgComponent } from './lucide-svg.component';
import type { IconNode } from 'lucide';

describe('LucideSvgComponent', () => {
  let fixture: ComponentFixture<LucideSvgComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LucideSvgComponent] });
    fixture = TestBed.createComponent(LucideSvgComponent);
  });

  it('renders every svg node kind', () => {
    const nodes: IconNode = [
      ['path', { d: 'M0 0', opacity: '0.4' }],
      ['circle', { cx: '1', cy: '2', r: '3' }],
      ['rect', { x: '0', y: '0', width: '4', height: '4', rx: '1', ry: '1' }],
      ['line', { x1: '0', x2: '1', y1: '0', y2: '1' }],
      ['polyline', { points: '0,0 1,1' }],
      ['polygon', { points: '0,0 1,1 0,1' }],
      ['ellipse', { cx: '1', cy: '1', rx: '2', ry: '3' }],
    ];
    fixture.componentInstance.nodes = nodes;
    fixture.componentInstance.size = 20;
    fixture.componentInstance.strokeWidth = 2;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('path')).toBeTruthy();
    expect(root.querySelector('circle')).toBeTruthy();
    expect(root.querySelector('rect')).toBeTruthy();
    expect(root.querySelector('line')).toBeTruthy();
    expect(root.querySelector('polyline')).toBeTruthy();
    expect(root.querySelector('polygon')).toBeTruthy();
    expect(root.querySelector('ellipse')).toBeTruthy();
    expect(root.querySelector('svg')?.getAttribute('width')).toBe('20');
  });
});
