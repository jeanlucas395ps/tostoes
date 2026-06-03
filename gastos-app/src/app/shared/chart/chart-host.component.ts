import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  input,
  viewChild,
  effect,
} from '@angular/core';
import {
  Chart,
  ChartConfiguration,
  registerables,
  defaults,
} from 'chart.js';

Chart.register(...registerables);

/* ── Global Chart.js defaults , Minimal UI inspired ──────────── */

defaults.font.family = "'Public Sans', system-ui, sans-serif";
defaults.font.size   = 12;
defaults.font.weight = 600;
defaults.color       = '#637381';

// Legend
defaults.plugins.legend.labels.usePointStyle  = true;
defaults.plugins.legend.labels.pointStyle     = 'circle';
defaults.plugins.legend.labels.boxWidth       = 8;
defaults.plugins.legend.labels.boxHeight      = 8;
defaults.plugins.legend.labels.padding        = 20;
defaults.plugins.legend.labels.font           = { size: 12, weight: 600 };

// Tooltip
defaults.plugins.tooltip.backgroundColor  = '#212B36';
defaults.plugins.tooltip.titleColor       = '#FFFFFF';
defaults.plugins.tooltip.bodyColor        = 'rgba(255,255,255,0.8)';
defaults.plugins.tooltip.borderColor      = 'rgba(255,255,255,0.08)';
defaults.plugins.tooltip.borderWidth      = 1;
defaults.plugins.tooltip.padding          = 12;
defaults.plugins.tooltip.cornerRadius     = 10;
defaults.plugins.tooltip.titleFont        = { size: 13, weight: 700 };
defaults.plugins.tooltip.bodyFont         = { size: 12, weight: 500 };

@Component({
  selector: 'app-chart-host',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: `:host { display: block; position: relative; height: 280px; } canvas { max-height: 280px; }`,
})
export class ChartHostComponent implements AfterViewInit, OnDestroy {
  config = input.required<ChartConfiguration>();
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const cfg = this.config();
      if (this.chart && cfg) {
        this.chart.data = cfg.data!;
        if (cfg.options) this.chart.options = cfg.options;
        this.chart.update('active');
      }
    });
  }

  ngAfterViewInit(): void {
    this.chart = new Chart(this.canvas().nativeElement, this.config());
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
