import { Component, Input } from '@angular/core';
import type { IconNode } from 'lucide';

/** Renderiza nós SVG do pacote `lucide` (MIT). */
@Component({
  selector: 'app-lucide-svg',
  standalone: true,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @for (node of nodes; track $index) {
        @switch (node[0]) {
          @case ('path') {
            <path [attr.d]="node[1]['d']" [attr.opacity]="node[1]['opacity']" />
          }
          @case ('circle') {
            <circle
              [attr.cx]="node[1]['cx']"
              [attr.cy]="node[1]['cy']"
              [attr.r]="node[1]['r']"
            />
          }
          @case ('rect') {
            <rect
              [attr.x]="node[1]['x']"
              [attr.y]="node[1]['y']"
              [attr.width]="node[1]['width']"
              [attr.height]="node[1]['height']"
              [attr.rx]="node[1]['rx']"
              [attr.ry]="node[1]['ry']"
            />
          }
          @case ('line') {
            <line
              [attr.x1]="node[1]['x1']"
              [attr.x2]="node[1]['x2']"
              [attr.y1]="node[1]['y1']"
              [attr.y2]="node[1]['y2']"
            />
          }
          @case ('polyline') {
            <polyline [attr.points]="node[1]['points']" />
          }
          @case ('polygon') {
            <polygon [attr.points]="node[1]['points']" />
          }
          @case ('ellipse') {
            <ellipse
              [attr.cx]="node[1]['cx']"
              [attr.cy]="node[1]['cy']"
              [attr.rx]="node[1]['rx']"
              [attr.ry]="node[1]['ry']"
            />
          }
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        line-height: 0;
      }
      svg {
        display: block;
      }
    `,
  ],
})
export class LucideSvgComponent {
  @Input({ required: true }) nodes: IconNode = [];
  @Input() size: number | string = 16;
  @Input() strokeWidth: number | string = 1.75;
}
