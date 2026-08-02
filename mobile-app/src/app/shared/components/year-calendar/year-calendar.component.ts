import { Component, input, output, computed } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { CurrencyBrlPipe } from '../../../core/pipes/currency-brl.pipe';
import { MONTH_LABELS, MonthSummary, PlanningUsageStart } from '../../../core/models/api.models';
import { isBeforePlanningUsageStart } from '../../../core/utils/planning-usage.util';

export interface CalendarMonthCell {
  index: number;
  label: string;
  shortLabel: string;
  balanceProjected: number;
  balanceReal: number;
  incomeProjected: number;
  expenseProjected: number;
  hasReal: boolean;
  hasProjected: boolean;
  showPreview: boolean;
  isEmpty: boolean;
}

@Component({
  selector: 'app-year-calendar',
  standalone: true,
  imports: [CurrencyBrlPipe, IonIcon],
  templateUrl: './year-calendar.component.html',
  styleUrl: './year-calendar.component.scss',
})
export class YearCalendarComponent {
  year = input.required<number>();
  selectedMonth = input.required<number>();
  months = input<MonthSummary[]>([]);
  planningUsageStart = input<PlanningUsageStart | null>(null);

  yearChange = output<number>();
  monthChange = output<number>();

  readonly today = new Date();

  cells = computed((): CalendarMonthCell[] => {
    const data = this.months();
    return MONTH_LABELS.map((label, index) => {
      const row = data.find((m) => m.month === index + 1);
      if (row?.beforePlanningStart) {
        return {
          index,
          label,
          shortLabel: label.slice(0, 3),
          balanceProjected: 0,
          balanceReal: 0,
          incomeProjected: 0,
          expenseProjected: 0,
          hasReal: false,
          hasProjected: false,
          showPreview: false,
          isEmpty: true,
        };
      }
      const income = row?.projected.income ?? 0;
      const expense = row?.projected.expense ?? 0;
      const investment = row?.projected.investment ?? 0;
      const goals = row?.projected.goals ?? 0;
      const leisure = row?.projected.leisure ?? 0;
      const balanceProjected =
        row?.balanceProjected ?? income - expense - investment - goals - leisure;
      const balanceReal = row?.balanceReal ?? 0;
      const hasReal =
        Math.abs(balanceReal) > 0.001 ||
        (row?.real.income ?? 0) > 0 ||
        (row?.real.expense ?? 0) > 0 ||
        (row?.real.investment ?? 0) > 0 ||
        (row?.real.goals ?? 0) > 0;
      const hasProjected =
        Math.abs(income) > 0.001 ||
        Math.abs(expense) > 0.001 ||
        Math.abs(balanceProjected) > 0.001 ||
        investment > 0 ||
        goals > 0 ||
        leisure > 0;

      return {
        index,
        label,
        shortLabel: label.slice(0, 3),
        balanceProjected,
        balanceReal,
        incomeProjected: income,
        expenseProjected: expense,
        hasReal,
        hasProjected,
        showPreview: hasProjected,
        isEmpty: !hasReal && !hasProjected,
      };
    });
  });

  isSelected(index: number): boolean {
    return this.selectedMonth() === index;
  }

  isCurrentMonth(index: number): boolean {
    return this.year() === this.today.getFullYear() && index === this.today.getMonth();
  }

  isPastMonth(index: number): boolean {
    const y = this.year();
    const nowY = this.today.getFullYear();
    const nowM = this.today.getMonth();
    if (y < nowY) return true;
    if (y > nowY) return false;
    return index < nowM;
  }

  selectMonth(index: number): void {
    const start = this.planningUsageStart();
    if (isBeforePlanningUsageStart(this.year(), index + 1, start)) return;
    this.monthChange.emit(index);
  }

  prevYear(): void {
    this.yearChange.emit(this.year() - 1);
  }

  nextYear(): void {
    this.yearChange.emit(this.year() + 1);
  }

  goToToday(): void {
    this.yearChange.emit(this.today.getFullYear());
    this.monthChange.emit(this.today.getMonth());
  }
}
