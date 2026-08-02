import { Component, inject, signal, computed, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import gsap from 'gsap';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { PlanningService } from '../../core/services/planning.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { YearCalendarComponent } from '../../shared/components/year-calendar/year-calendar.component';
import { PlanningManagerComponent } from '../../shared/components/planning-manager/planning-manager.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { AccountsSummary, DashboardSummary, FinancialGoal, MONTH_LABELS } from '../../core/models/api.models';
import { isPastMonth } from '../../core/utils/month.util';
import { clampMonthIndexForYear, isBeforePlanningUsageStart } from '../../core/utils/planning-usage.util';
import { buildDonutSlices } from '../../core/utils/donut-chart.util';

const BAR_H = 96;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CurrencyBrlPipe,
    MonthNavComponent,
    YearCalendarComponent,
    PlanningManagerComponent,
    SkeletonComponent,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit, AfterViewInit {
  private api = inject(FinanceApiService);
  planning = inject(PlanningService);

  @ViewChild('balanceValue') balanceValueRef?: ElementRef<HTMLElement>;
  @ViewChild('sections') sectionsRef?: ElementRef<HTMLElement>;

  readonly isPastMonth = isPastMonth;

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  data = signal<DashboardSummary | null>(null);
  accountsSummary = signal<AccountsSummary | null>(null);
  goals = signal<FinancialGoal[]>([]);
  loading = signal(true);
  showPlanningManager = signal(false);

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

  showProjected = computed(() => !isPastMonth(this.year(), this.month()));

  flowData = computed(() => {
    const d = this.data();
    if (!d) return null;
    const activeMonths = d.months.filter((m) => !m.beforePlanningStart);
    const maxVal = Math.max(
      ...activeMonths.flatMap((m) => [m.real.income, m.real.expense, m.projected.income, m.projected.expense]),
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
        };
      }),
    };
  });

  donutData = computed(() => {
    const m = this.selectedMonth();
    if (!m) return null;
    const income = m.real.income;
    if (income === 0) return null;

    const expense = m.real.expense;
    const invest = m.real.investment;
    const goals = m.real.goals ?? 0;
    const surplus = Math.max(0, income - expense - invest - goals);

    const result = buildDonutSlices(
      [
        { label: 'Gastos', value: expense, color: '#EF4444' },
        { label: 'Investimentos', value: invest, color: '#2065D1' },
        { label: 'Sobra', value: surplus, color: '#10B981' },
      ],
      { gap: 3, minSweep: 2 }
    );
    if (!result) return null;
    return { slices: result.slices, income, balance: m.balanceReal };
  });

  goalsChart = computed(() => {
    const items = this.goals().filter((g) => (g.remainingAmountBrl ?? g.targetAmountBrl - g.currentAmountBrl) > 0);
    if (!items.length) return null;
    return {
      items: items.map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        pct: g.pct,
        currentAmountBrl: g.currentAmountBrl,
        targetAmountBrl: g.targetAmountBrl,
      })),
    };
  });

  ngOnInit(): void {
    this.load();
  }

  ngAfterViewInit(): void {
    this.animateEntrance();
  }

  load(refresher?: HTMLIonRefresherElement): void {
    this.loading.set(true);
    this.api.getDashboard(this.year()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.ensureMonthWithinPlanningUsage(d);
        this.loading.set(false);
        refresher?.complete();
        requestAnimationFrame(() => this.animateEntrance());
      },
      error: () => {
        this.loading.set(false);
        refresher?.complete();
      },
    });
    this.api.getAccountsSummary().subscribe({
      next: (s) => this.accountsSummary.set(s),
      error: () => this.accountsSummary.set(null),
    });
    this.loadGoals();
  }

  onRefresh(ev: CustomEvent): void {
    this.load(ev.target as unknown as HTMLIonRefresherElement);
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

  private animateEntrance(): void {
    const el = this.balanceValueRef?.nativeElement;
    const m = this.selectedMonth();
    if (el && m) {
      const target = { v: 0 };
      gsap.to(target, {
        v: m.balanceReal,
        duration: 0.9,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(target.v);
        },
      });
    }
    const cards = this.sectionsRef?.nativeElement?.querySelectorAll('.reveal');
    if (cards?.length) {
      gsap.fromTo(
        cards,
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power2.out' }
      );
    }
  }
}
