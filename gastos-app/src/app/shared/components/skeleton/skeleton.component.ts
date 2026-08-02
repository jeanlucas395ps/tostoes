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
  /** Layout do placeholder. */
  variant = input<SkeletonVariant>('list');
  /** Quantidade de itens (cards/linhas/kpis). */
  count = input(3);
  /** Rótulo acessível. */
  label = input('Carregando');

  items = computed(() => Array.from({ length: Math.max(1, this.count()) }, (_, i) => i));
}
