import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton } from '@ionic/angular/standalone';
import { FinanceApiService } from '../../../core/services/finance-api.service';
import { FinancialAccount, FinancialGoal } from '../../../core/models/api.models';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addYears(date: string, years: number): string {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

interface GoalFormState {
  name: string;
  description: string;
  targetFinancialAccountId: number | null;
  targetAmountBrl: number;
  startDate: string;
  endDate: string;
  dueDay: number;
  sourceFinancialAccountId: number | null;
  color: string;
}

@Component({
  selector: 'app-goal-form-page',
  standalone: true,
  imports: [FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton],
  templateUrl: './goal-form.page.html',
  styleUrl: './goal-form.page.scss',
})
export class GoalFormPage implements OnInit {
  private api = inject(FinanceApiService);
  private router = inject(Router);

  goal = signal<FinancialGoal | null>(null);
  bankAccounts = signal<FinancialAccount[]>([]);
  investmentAccounts = signal<FinancialAccount[]>([]);
  saving = signal(false);
  error = signal('');

  form: GoalFormState = this.blankForm();

  constructor() {
    const passedGoal = this.router.getCurrentNavigation()?.extras?.state?.['goal'] as FinancialGoal | undefined;
    if (passedGoal) {
      this.goal.set(passedGoal);
      this.form = this.formFromGoal(passedGoal);
    }
  }

  ngOnInit(): void {
    this.api.getAccounts('bank').subscribe((r) => this.bankAccounts.set(r.items));
    this.api.getAccounts('investment').subscribe((r) => this.investmentAccounts.set(r.items));
  }

  private blankForm(): GoalFormState {
    return {
      name: '',
      description: '',
      targetFinancialAccountId: null,
      targetAmountBrl: 0,
      startDate: today(),
      endDate: addYears(today(), 1),
      dueDay: Math.min(28, new Date().getDate()),
      sourceFinancialAccountId: null,
      color: '#0057FF',
    };
  }

  private formFromGoal(g: FinancialGoal): GoalFormState {
    return {
      name: g.name,
      description: g.description ?? '',
      targetFinancialAccountId: g.targetFinancialAccountId ?? null,
      targetAmountBrl: g.targetAmountBrl,
      startDate: (g.startDate ?? today()).slice(0, 10),
      endDate: (g.endDate ?? addYears(today(), 1)).slice(0, 10),
      dueDay: g.dueDay,
      sourceFinancialAccountId: g.sourceFinancialAccountId ?? null,
      color: g.color,
    };
  }

  isEditing(): boolean {
    return !!this.goal();
  }

  accountBalanceBrl(): number {
    const acc = this.investmentAccounts().find((a) => a.id === this.form.targetFinancialAccountId);
    return acc?.balanceBrl ?? 0;
  }

  private monthCountFromForm(): number {
    const start = this.form.startDate;
    const end = this.form.endDate;
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    if (e < s) return 0;
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  }

  computedMonthly(): number {
    const months = this.monthCountFromForm();
    if (months <= 0) return 0;
    const remaining = this.form.targetAmountBrl - this.accountBalanceBrl();
    if (remaining <= 0) return 0;
    return Math.round((remaining / months) * 100) / 100;
  }

  cancel(): void {
    this.router.navigateByUrl('/metas');
  }

  save(): void {
    this.error.set('');
    if (!this.form.name.trim()) {
      this.error.set('Informe um nome.');
      return;
    }
    if (!this.form.targetFinancialAccountId) {
      this.error.set('Selecione a conta de investimento de destino. O progresso usa o saldo atual dessa conta.');
      return;
    }
    if (this.form.targetAmountBrl <= this.accountBalanceBrl()) {
      const current = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        this.accountBalanceBrl()
      );
      this.error.set(`O valor final deve ser maior que o saldo atual da conta (${current}).`);
      return;
    }
    if (!this.form.startDate || !this.form.endDate || this.form.startDate > this.form.endDate) {
      this.error.set('Informe um período válido (início antes do fim).');
      return;
    }

    this.saving.set(true);
    this.api
      .saveGoal(
        {
          name: this.form.name.trim(),
          description: this.form.description.trim() || undefined,
          color: this.form.color,
          targetAmountBrl: this.form.targetAmountBrl,
          startDate: this.form.startDate,
          endDate: this.form.endDate,
          dueDay: this.form.dueDay,
          sourceFinancialAccountId: this.form.sourceFinancialAccountId,
          targetFinancialAccountId: this.form.targetFinancialAccountId,
        },
        this.goal()?.id
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.router.navigateByUrl('/metas');
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err.error?.error ?? 'Não foi possível salvar a meta.');
        },
      });
  }
}
