import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { YearCalendarComponent } from '../../shared/components/year-calendar/year-calendar.component';
import {
  AccountsSummary,
  DashboardSummary,
  FinancialAccount,
  FinancialGoal,
  MONTH_LABELS,
} from '../../core/models/api.models';
import { isPastMonth } from '../../core/utils/month.util';
import {
  clampMonthIndexForYear,
  isBeforePlanningUsageStart,
} from '../../core/utils/planning-usage.util';
import { formatMoney, isForeignCurrency } from '../../core/utils/money.util';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';

const BAR_H = 140; // pixel height of bar tracks

export type DetailTableView = 'all' | 'real' | 'projected';

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArcPath(cx: number, cy: number, R: number, ri: number, a1: number, a2: number): string {
  const s  = polarToCartesian(cx, cy, R, a1);
  const e  = polarToCartesian(cx, cy, R, a2);
  const si = polarToCartesian(cx, cy, ri, a2);
  const ei = polarToCartesian(cx, cy, ri, a1);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M${s.x.toFixed(2)},${s.y.toFixed(2)}A${R},${R} 0 ${large} 1 ${e.x.toFixed(2)},${e.y.toFixed(2)}L${si.x.toFixed(2)},${si.y.toFixed(2)}A${ri},${ri} 0 ${large} 0 ${ei.x.toFixed(2)},${ei.y.toFixed(2)}Z`;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CurrencyBrlPipe, MonthNavComponent, RouterLink, YearCalendarComponent, SkeletonComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private api = inject(FinanceApiService);

  readonly isPastMonth = isPastMonth;

  year  = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  data  = signal<DashboardSummary | null>(null);
  accountsSummary = signal<AccountsSummary | null>(null);
  goals = signal<FinancialGoal[]>([]);
  loading = signal(true);
  /** Colunas da tabela «Detalhe mensal»: tudo (padrão), só confirmado ou só previsto. */
  detailTableView = signal<DetailTableView>('all');
  detailTableShowReal = computed(() => {
    const v = this.detailTableView();
    return v === 'all' || v === 'real';
  });
  detailTableShowProjected = computed(() => {
    const v = this.detailTableView();
    return v === 'all' || v === 'projected';
  });

  /** Mês selecionado; se a API não trouxer a linha, usa zeros (mantém navegação). */
  selectedMonth = computed(() => {
    const d = this.data();
    if (!d) return null;
    const idx = this.month();
    const found = d.months.find((m) => m.month === idx + 1);
    if (found) return found;
    const label = MONTH_LABELS[idx] ?? `Mês ${idx + 1}`;
    const zero = { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 };
    return {
      month: idx + 1,
      label,
      real: { ...zero },
      projected: { ...zero },
      balanceReal: 0,
      balanceProjected: 0,
    };
  });

  monthNavPills = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.months.map((mo) => ({
      month: mo.month,
      label: mo.label.slice(0, 3),
    }));
  });

  showProjected = computed(() => !isPastMonth(this.year(), this.month()));

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.getDashboard(this.year()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.ensureMonthWithinPlanningUsage(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.getAccountsSummary().subscribe({
      next: (s) => this.accountsSummary.set(s),
      error: () => this.accountsSummary.set(null),
    });
    this.loadGoals();
  }

  onYearChange(y: number): void {
    this.year.set(y);
    const start = this.data()?.planningUsageStart;
    this.month.set(clampMonthIndexForYear(y, this.month(), start));
    this.load();
  }

  onMonthChange(m: number): void {
    this.month.set(m);
    this.loadGoals();
  }

  private ensureMonthWithinPlanningUsage(d: DashboardSummary): void {
    const start = d.planningUsageStart;
    if (!start) return;
    const y = this.year();
    const m = this.month() + 1;
    if (isBeforePlanningUsageStart(y, m, start)) {
      if (y < start.year) {
        this.year.set(start.year);
        this.month.set(start.month - 1);
        this.load();
        return;
      }
      this.month.set(start.month - 1);
    }
  }

  private loadGoals(): void {
    this.api.getGoals(this.year(), this.month() + 1).subscribe({
      next: (r) => this.goals.set(r.items),
      error: () => this.goals.set([]),
    });
  }

  isForeignCurrency = isForeignCurrency;

  accountEurBalance(a: FinancialAccount): string {
    return formatMoney(a.balance, a.currency === 'USD' ? 'USD' : 'EUR');
  }

  accountForeignBalance(a: FinancialAccount): string {
    return formatMoney(a.balance, a.currency);
  }

  /** Investimentos + metas, só para a tabela «Detalhe mensal». */
  investMetasReal(row: { real: { investment?: number; goals?: number } }): number {
    return (row.real.investment ?? 0) + (row.real.goals ?? 0);
  }

  investMetasProjected(row: { projected: { investment?: number; goals?: number } }): number {
    return (row.projected.investment ?? 0) + (row.projected.goals ?? 0);
  }

  formatBrlOrDash(value: number, inactive: boolean): string {
    if (inactive) return ', ';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  /* ── Chart 1: Recebimentos vs Gastos, barras lado a lado ─────── */

  flowData = computed(() => {
    const d = this.data();
    if (!d) return null;
    const activeMonths = d.months.filter((m) => !m.beforePlanningStart);
    const maxVal = Math.max(
      ...activeMonths.flatMap((m) => [
        m.real.income,
        m.real.expense,
        m.projected.income,
        m.projected.expense,
      ]),
      1
    );
    return {
      months: d.months.map((m) => {
        const inactive = !!m.beforePlanningStart;
        return {
          label: m.label.slice(0, 3),
          month: m.month,
          inactive,
          incomeH: inactive ? 0 : Math.round((m.real.income / maxVal) * BAR_H),
          expenseH: inactive ? 0 : Math.round((m.real.expense / maxVal) * BAR_H),
          incomeProjH: inactive ? 0 : Math.round((m.projected.income / maxVal) * BAR_H),
          expenseProjH: inactive ? 0 : Math.round((m.projected.expense / maxVal) * BAR_H),
          incomeVal: m.real.income,
          expenseVal: m.real.expense,
          incomeProjVal: m.projected.income,
          expenseProjVal: m.projected.expense,
        };
      }),
    };
  });

  /* ── Donut chart: distribuição do mês ────────────────────────── */

  donutData = computed(() => {
    const m = this.selectedMonth();
    const d = this.data();
    if (!m || !d) return null;
    const income = m.real.income;
    if (income === 0) return null;

    const expense  = m.real.expense;
    const invest   = m.real.investment;
    const goals    = m.real.goals ?? 0;
    const surplus  = Math.max(0, income - expense - invest - goals);

    const raw = [
      { label: 'Gastos',        value: expense, color: '#EF4444' },
      { label: 'Investimentos', value: invest,  color: '#2065D1' },
      { label: 'Sobra',         value: surplus, color: '#10B981' },
    ].filter(s => s.value > 0);

    const total = raw.reduce((s, i) => s + i.value, 0) || 1;
    let angle = -90;
    const gap = 3;
    const paths = raw.map(item => {
      const sweep = Math.max(0, (item.value / total) * 360 - gap);
      const path  = sweep > 2 ? donutArcPath(100, 100, 80, 50, angle, angle + sweep) : '';
      const pct   = Math.round((item.value / income) * 100);
      angle += sweep + gap;
      return { ...item, path, pct };
    }).filter(p => p.path);

    const months = d.months.map(mo => ({ month: mo.month, label: mo.label.slice(0, 3) }));

    return { paths, income, balance: m.balanceReal, label: m.label, months };
  });

  /** "2026-06-03" → "3 jun. 2026" */
  private fmtDate(d: string): string {
    const ms = ['jan.','fev.','mar.','abr.','mai.','jun.','jul.','ago.','set.','out.','nov.','dez.'];
    const p = d.slice(0, 10).split('-');
    if (p.length < 3) return d;
    return `${+p[2]} ${ms[+p[1]-1]} ${p[0]}`;
  }

  goalsChart = computed(() => {
    const items = this.goals().filter(
      (g) => (g.remainingAmountBrl ?? g.targetAmountBrl - g.currentAmountBrl) > 0
    );
    if (!items.length) return null;

    const monthProjected = items.reduce((s, g) => s + g.projectedMonthBrl, 0);

    return {
      totalCurrent: items.reduce((s, g) => s + g.currentAmountBrl, 0),
      totalTarget: items.reduce((s, g) => s + g.targetAmountBrl, 0),
      monthProjected,
      items: items.map((g) => {
        const start = g.startDate ?? g.deadlineDate ?? '';
        const end = g.endDate ?? g.deadlineDate ?? '';
        return {
        id: g.id,
        name: g.name.length > 14 ? g.name.slice(0, 13) + '…' : g.name,
        fullName: g.name,
        color: g.color,
        startDate: start ? this.fmtDate(start) : ', ',
        endDate: end ? this.fmtDate(end) : ', ',
        plannedPct: g.plannedPct,
        confirmedBarPct: g.confirmedBarPct,
        currentAmountBrl: g.currentAmountBrl,
        targetAmountBrl: g.targetAmountBrl,
        monthlyAmountBrl: g.monthlyAmountBrl,
        pct: g.pct,
        };
      }),
    };
  });
}
