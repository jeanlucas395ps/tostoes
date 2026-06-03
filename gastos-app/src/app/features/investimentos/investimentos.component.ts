import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import {
  InvestmentType,
  Projection,
  Transaction,
  AppSettings,
} from '../../core/models/api.models';

@Component({
  selector: 'app-investimentos',
  standalone: true,
  imports: [FormsModule, CurrencyBrlPipe, MonthNavComponent, UserAvatarComponent, NgTemplateOutlet],
  templateUrl: './investimentos.component.html',
  styleUrl: './investimentos.component.scss',
})
export class InvestimentosComponent implements OnInit {
  private api = inject(FinanceApiService);

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  tab = signal<'real' | 'projecao'>('real');

  types = signal<InvestmentType[]>([]);
  realItems = signal<Transaction[]>([]);
  projections = signal<Projection[]>([]);
  settings = signal<AppSettings | null>(null);
  loading = signal(true);
  showForm = signal(false);
  editingTx = signal<Transaction | null>(null);

  form: Partial<Transaction> & { eurToBrl?: number; investmentTypeId?: number | null } = {};

  monthRealTotal = computed(() =>
    this.realItems().reduce((s, t) => s + t.amountBrl, 0)
  );

  monthProjectedTotal = computed(() =>
    this.projections()
      .filter((p) => p.month === this.month() + 1)
      .reduce((s, p) => s + p.amountBrl, 0)
  );

  projectionsForMonth = computed(() =>
    this.projections().filter((p) => p.month === this.month() + 1)
  );

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) => this.settings.set(s));
    this.api.getInvestmentTypes().subscribe((r) => this.types.set(r.items));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const y = this.year();
    const m = this.month() + 1;
    this.api.getTransactions(y, m, 'investment').subscribe((r) => {
      this.realItems.set(r.items);
    });
    this.api.getProjections(y, 'investment').subscribe((r) => {
      this.projections.set(r.items);
      this.loading.set(false);
    });
  }

  openNewReal(): void {
    const d = new Date(this.year(), this.month(), 15);
    this.editingTx.set(null);
    this.form = {
      transactionDate: d.toISOString().slice(0, 10),
      kind: 'investment',
      description: '',
      amount: 0,
      currency: 'BRL',
      category: 'Investimentos',
      region: 'geral',
      investmentTypeId: this.types()[0]?.id,
    };
    this.showForm.set(true);
  }

  openEditReal(tx: Transaction): void {
    if (this.editingTx()?.id === tx.id) {
      this.cancelForm();
      return;
    }
    this.editingTx.set(tx);
    this.form = { ...tx };
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingTx.set(null);
  }

  saveReal(): void {
    const s = this.settings();
    this.api
      .saveTransaction(
        { ...this.form, kind: 'investment', eurToBrl: s?.eurToBrl ?? 6 },
        this.editingTx()?.id
      )
      .subscribe(() => {
        this.cancelForm();
        this.load();
      });
  }

  removeReal(id: number): void {
    if (!confirm('Excluir aporte?')) return;
    this.api.deleteTransaction(id).subscribe(() => this.load());
  }

  progress(type: InvestmentType): number {
    const target = type.targetMonthlyBrl;
    if (target <= 0) return 0;
    const real = this.realItems()
      .filter((t) => t.investmentTypeId === type.id)
      .reduce((s, t) => s + t.amountBrl, 0);
    return Math.min(100, Math.round((real / target) * 100));
  }
}
