import { Component, computed, input } from '@angular/core';

export type SkeletonVariant =
  | 'kpi'
  | 'totals'
  | 'list'
  | 'cards'
  | 'rows'
  | 'page'
  | 'detail'
  | 'form';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  templateUrl: './skeleton.component.html',
  styleUrl: './skeleton.component.scss',
})
export class SkeletonComponent {
  variant = input<SkeletonVariant>('list');
  count = input(3);
  label = input('Carregando');

  items = computed(() => Array.from({ length: Math.max(1, this.count()) }, (_, i) => i));
}
