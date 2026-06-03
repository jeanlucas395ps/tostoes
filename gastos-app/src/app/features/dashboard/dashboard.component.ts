import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { ChartHostComponent } from '../../shared/chart/chart-host.component';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { ChartConfiguration, TooltipItem } from 'chart.js';
import { DashboardSummary, MONTH_LABELS } from '../../core/models/api.models';

/* ── Helpers ──────────────────────────────────────────────────────── */

function brlTick(v: number | string): string {
  const n = Number(v);
  if (Math.abs(n) >= 1000) return 'R$' + (n / 1000).toFixed(0) + 'k';
  return 'R$' + n.toFixed(0);
}

/** Build a smooth SVG bezier sparkline path (no axes, just the line). */
function spark(values: number[], W = 88, H = 32): string {
  if (values.every(v => v === 0)) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 4) - 2, // 2px padding top/bottom
  }));
  return pts.map((p, i) => {
    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cx = ((prev.x + p.x) / 2).toFixed(1);
    return `C${cx},${prev.y.toFixed(1)} ${cx},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join('');
}

/** Area path: close sparkline below into a filled shape. */
function sparkArea(linePath: string, W: number, H: number): string {
  if (!linePath) return '';
  return `${linePath}L${W},${H}L0,${H}Z`;
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/* ── Chart options (Minimal UI style) ────────────────────────────── */

function chartOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#637381',
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
          padding: 20,
          font: { size: 12, weight: 600 },
        },
      },
      tooltip: {
        backgroundColor: '#212B36',
        titleColor: '#fff',
        bodyColor: 'rgba(255,255,255,0.8)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${ctx.dataset.label}: R$ ${(ctx.parsed.y ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#919EAB', font: { size: 11 } },
        grid: { color: 'rgba(145, 158, 171, 0.08)', lineWidth: 1 },
        border: { color: 'transparent' },
      },
      y: {
        ticks: { color: '#919EAB', font: { size: 11 }, callback: brlTick },
        grid: { color: 'rgba(145, 158, 171, 0.08)', lineWidth: 1 },
        border: { color: 'transparent', dash: [4, 4] },
      },
    },
  };
}

/* ── Component ────────────────────────────────────────────────────── */

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyBrlPipe, ChartHostComponent, MonthNavComponent, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private api = inject(FinanceApiService);

  year  = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  data  = signal<DashboardSummary | null>(null);
  loading = signal(true);

  currentMonth = computed(() => {
    const d = this.data();
    if (!d) return null;
    return d.months.find((m) => m.month === this.month() + 1) ?? null;
  });

  /* ── Sparklines (12-month trend for each metric) ─────────────── */

  sparklines = computed(() => {
    const d = this.data();
    if (!d) return null;
    const W = 88, H = 32;
    const inc = d.months.map(m => m.real.income);
    const exp = d.months.map(m => m.real.expense);
    const inv = d.months.map(m => m.real.investment);
    const bal = d.months.map(m => m.balanceReal);
    return {
      incomeLine:  spark(inc, W, H),
      expenseLine: spark(exp, W, H),
      investLine:  spark(inv, W, H),
      balanceLine: spark(bal, W, H),
      incomeArea:  sparkArea(spark(inc, W, H), W, H),
      expenseArea: sparkArea(spark(exp, W, H), W, H),
      investArea:  sparkArea(spark(inv, W, H), W, H),
      balanceArea: sparkArea(spark(bal, W, H), W, H),
      W, H,
    };
  });

  /* ── Trend vs previous month ─────────────────────────────────── */

  trends = computed(() => {
    const m = this.currentMonth();
    const d = this.data();
    if (!m || !d) return null;
    const idx  = d.months.findIndex(mo => mo.month === m.month);
    const prev = d.months[idx - 1];
    if (!prev) return null;
    return {
      income:  pctChange(m.real.income,     prev.real.income),
      expense: pctChange(m.real.expense,    prev.real.expense),
      invest:  pctChange(m.real.investment, prev.real.investment),
      balance: pctChange(m.balanceReal,     prev.balanceReal),
    };
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.getDashboard(this.year()).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onYearChange(y: number): void { this.year.set(y); this.load(); }

  formatTrend(v: number | null): string {
    if (v === null) return '';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  /* ── Main bar chart (Minimal UI colors) ──────────────────────── */

  balanceChart = computed<ChartConfiguration>(() => {
    const d = this.data();
    const labels = MONTH_LABELS.map((l) => l.slice(0, 3));
    if (!d) return { type: 'bar', data: { labels, datasets: [] } };
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Ganhos',
            data: d.months.map((m) => m.real.income),
            backgroundColor: 'rgba(0, 171, 85, 0.80)',
            hoverBackgroundColor: '#22C55E',
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: false,
          },
          {
            label: 'Custos',
            data: d.months.map((m) => m.real.expense),
            backgroundColor: 'rgba(255, 171, 0, 0.80)',
            hoverBackgroundColor: '#FFAB00',
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: false,
          },
          {
            label: 'Investido',
            data: d.months.map((m) => m.real.investment),
            backgroundColor: 'rgba(32, 101, 209, 0.75)',
            hoverBackgroundColor: '#2065D1',
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: false,
          },
        ],
      },
      options: chartOpts(),
    };
  });
}
