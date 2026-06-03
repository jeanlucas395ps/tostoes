import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { FinancialAccount, FinancialGoal } from '../../core/models/api.models';

@Component({
  selector: 'app-goals',
  standalone: true,
  imports: [FormsModule, CurrencyBrlPipe],
  templateUrl: './goals.component.html',
  styleUrl: './goals.component.scss',
})
export class GoalsComponent implements OnInit {
  private api = inject(FinanceApiService);

  year = signal(new Date().getFullYear());
  items = signal<FinancialGoal[]>([]);
  bankAccounts = signal<FinancialAccount[]>([]);
  investmentAccounts = signal<FinancialAccount[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editingId = signal<number | null>(null);

  form = {
    name: '',
    description: '',
    color: '#6B4EE6',
    targetAmountBrl: 0,
    startDate: '',
    endDate: '',
    dueDay: 1,
    sourceFinancialAccountId: null as number | null,
    targetFinancialAccountId: null as number | null,
  };

  /** Saldo atual da conta de destino selecionada (referência dinâmica da meta). */
  accountBalanceBrl = computed(() => {
    const id = this.form.targetFinancialAccountId;
    if (!id) return 0;
    return this.investmentAccounts().find((a) => a.id === id)?.balanceBrl ?? 0;
  });

  computedMonthly = computed(() => {
    const current = this.accountBalanceBrl();
    const target = this.form.targetAmountBrl;
    const months = this.monthCountFromForm();
    if (target <= current || months < 1) return 0;
    return Math.round(((target - current) / months) * 100) / 100;
  });

  ngOnInit(): void {
    this.api.getAccounts('bank').subscribe((r) => this.bankAccounts.set(r.items));
    this.api.getAccounts('investment').subscribe((r) => this.investmentAccounts.set(r.items));
    this.load();
  }

  monthCountFromForm(): number {
    const a = this.form.startDate;
    const b = this.form.endDate;
    if (!a || !b || a > b) return 0;
    const start = new Date(a + 'T12:00:00');
    const end = new Date(b + 'T12:00:00');
    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1
    );
  }

  load(): void {
    this.loading.set(true);
    this.api.getGoals(this.year()).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.editingId.set(null);
    const today = new Date();
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);
    this.form = {
      name: '',
      description: '',
      color: '#6B4EE6',
      targetAmountBrl: 0,
      startDate: today.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      dueDay: Math.min(28, today.getDate()),
      sourceFinancialAccountId: null,
      targetFinancialAccountId: null,
    };
    this.showForm.set(true);
  }

  openEdit(g: FinancialGoal): void {
    this.editingId.set(g.id);
    this.form = {
      name: g.name,
      description: g.description ?? '',
      color: g.color,
      targetAmountBrl: g.targetAmountBrl,
      startDate: g.startDate?.slice(0, 10) ?? '',
      endDate: g.endDate?.slice(0, 10) ?? '',
      dueDay: g.dueDay ?? 1,
      sourceFinancialAccountId: g.sourceFinancialAccountId ?? null,
      targetFinancialAccountId: g.targetFinancialAccountId ?? null,
    };
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.form.name.trim()) return;
    if (!this.form.targetFinancialAccountId) {
      alert('Selecione a conta de investimento de destino. O progresso usa o saldo atual dessa conta.');
      return;
    }
    const current = this.accountBalanceBrl();
    if (this.form.targetAmountBrl <= current) {
      alert(
        `O valor final deve ser maior que o saldo atual da conta (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(current)}).`
      );
      return;
    }
    if (!this.form.startDate || !this.form.endDate || this.form.startDate > this.form.endDate) {
      alert('Informe um período válido (início antes do fim).');
      return;
    }

    this.saving.set(true);
    const body = {
      name: this.form.name.trim(),
      description: this.form.description.trim() || undefined,
      color: this.form.color,
      targetAmountBrl: this.form.targetAmountBrl,
      startDate: this.form.startDate,
      endDate: this.form.endDate,
      dueDay: this.form.dueDay,
      sourceFinancialAccountId: this.form.sourceFinancialAccountId,
      targetFinancialAccountId: this.form.targetFinancialAccountId,
    };
    const id = this.editingId();
    this.api.saveGoal(body, id ?? undefined).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  remove(g: FinancialGoal): void {
    if (!confirm(`Remover a meta "${g.name}"?`)) return;
    this.api.deleteGoal(g.id).subscribe(() => this.load());
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const months = ['jan.','fev.','mar.','abr.','mai.','jun.','jul.','ago.','set.','out.','nov.','dez.'];
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const day   = parseInt(parts[2], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year  = parts[0];
    return `${day} ${months[month]} ${year}`;
  }
}
