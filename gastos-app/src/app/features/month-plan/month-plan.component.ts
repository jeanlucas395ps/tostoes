import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import {
  EntryKind,
  MONTH_LABELS,
  MonthPlan,
  MonthPlanEntry,
  MonthPlanForecastItem,
} from '../../core/models/api.models';

type PlanTab = 'today' | 'overdue' | 'variable' | 'upcoming' | 'done';

@Component({
  selector: 'app-month-plan',
  standalone: true,
  imports: [FormsModule, CurrencyBrlPipe, MonthNavComponent, RouterLink],
  templateUrl: './month-plan.component.html',
  styleUrl: './month-plan.component.scss',
})
export class MonthPlanComponent implements OnInit {
  private api = inject(FinanceApiService);

  readonly MONTH_LABELS = MONTH_LABELS;

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  plan = signal<MonthPlan | null>(null);
  loading = signal(true);
  busyId = signal<number | null>(null);
  activeTab = signal<PlanTab>('today');
  showAddVariable = signal(false);

  addForm = {
    kind: 'expense' as EntryKind,
    name: '',
    amount: 0,
    category: 'Variável',
  };

  editAmounts = signal<Record<number, number>>({});

  apiMonth = computed(() => this.month() + 1);

  tabs = computed(() => {
    const p = this.plan();
    if (!p) return [];
    const s = p.sections;
    return [
      { id: 'today' as PlanTab, label: 'Hoje', count: s.today.length },
      { id: 'overdue' as PlanTab, label: 'Atrasados', count: s.overdue.length },
      { id: 'variable' as PlanTab, label: 'Variáveis', count: s.variable.length },
      { id: 'upcoming' as PlanTab, label: 'Próximos', count: s.upcoming.length + p.forecast.length },
      { id: 'done' as PlanTab, label: 'Feitos', count: s.completed.length },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getMonthPlan(this.year(), this.apiMonth()).subscribe({
      next: (p) => {
        this.plan.set(p);
        const edits: Record<number, number> = {};
        const all = [
          ...p.sections.today,
          ...p.sections.overdue,
          ...p.sections.upcoming,
          ...p.sections.variable,
        ];
        for (const e of all) {
          if (e.status === 'pending') edits[e.id] = e.suggestedAmountBrl;
        }
        this.editAmounts.set(edits);
        if (p.sections.today.length > 0) this.activeTab.set('today');
        else if (p.sections.overdue.length > 0) this.activeTab.set('overdue');
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onYearChange(y: number): void {
    this.year.set(y);
    this.load();
  }

  onMonthChange(m: number): void {
    this.month.set(m);
    this.load();
  }

  listForTab(): MonthPlanEntry[] {
    const p = this.plan();
    if (!p) return [];
    const s = p.sections;
    switch (this.activeTab()) {
      case 'today':
        return s.today;
      case 'overdue':
        return s.overdue;
      case 'variable':
        return s.variable;
      case 'upcoming':
        return s.upcoming;
      case 'done':
        return s.completed;
      default:
        return [];
    }
  }

  forecastForTab(): MonthPlanForecastItem[] {
    if (this.activeTab() !== 'upcoming') return [];
    return this.plan()?.forecast ?? [];
  }

  amountFor(entry: MonthPlanEntry): number {
    return this.editAmounts()[entry.id] ?? entry.suggestedAmountBrl;
  }

  setAmount(entry: MonthPlanEntry, value: number): void {
    this.editAmounts.update((m) => ({ ...m, [entry.id]: value }));
  }

  saveAmount(entry: MonthPlanEntry): void {
    const amount = this.amountFor(entry);
    if (amount === entry.suggestedAmountBrl) return;
    this.busyId.set(entry.id);
    this.api.updateMonthPlanEntry(entry.id, { suggestedAmountBrl: amount }).subscribe({
      next: (p) => {
        this.plan.set(p);
        this.busyId.set(null);
      },
      error: () => this.busyId.set(null),
    });
  }

  confirm(entry: MonthPlanEntry): void {
    this.busyId.set(entry.id);
    this.api.confirmMonthPlanEntry(entry.id, { amountBrl: this.amountFor(entry) }).subscribe({
      next: (p) => {
        this.plan.set(p);
        this.busyId.set(null);
      },
      error: () => this.busyId.set(null),
    });
  }

  skip(entry: MonthPlanEntry): void {
    this.busyId.set(entry.id);
    this.api.skipMonthPlanEntry(entry.id).subscribe({
      next: (p) => {
        this.plan.set(p);
        this.busyId.set(null);
      },
      error: () => this.busyId.set(null),
    });
  }

  spawnAndConfirm(f: MonthPlanForecastItem): void {
    this.busyId.set(f.recurringItemId);
    this.api
      .spawnMonthPlanEntry({
        year: this.year(),
        month: this.apiMonth(),
        recurringItemId: f.recurringItemId,
        amountBrl: f.suggestedAmountBrl,
      })
      .subscribe({
        next: (p) => {
          const entry = [
            ...p.sections.today,
            ...p.sections.overdue,
            ...p.sections.upcoming,
          ].find((e) => e.recurringItemId === f.recurringItemId);
          this.plan.set(p);
          if (entry) this.confirm(entry);
          else this.busyId.set(null);
        },
        error: () => this.busyId.set(null),
      });
  }

  addVariable(): void {
    const f = this.addForm;
    if (!f.name.trim()) return;
    this.loading.set(true);
    this.api
      .addMonthPlanEntry({
        year: this.year(),
        month: this.apiMonth(),
        kind: f.kind,
        name: f.name.trim(),
        suggestedAmountBrl: f.amount,
        category: f.category,
      })
      .subscribe({
        next: (p) => {
          this.plan.set(p);
          this.showAddVariable.set(false);
          this.activeTab.set('variable');
          this.addForm = { kind: 'expense', name: '', amount: 0, category: 'Variável' };
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
