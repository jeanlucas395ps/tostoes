import { Component, inject, signal, OnInit, input, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import {
  EntryKind,
  Transaction,
  AppSettings,
  MONTH_LABELS,
} from '../../core/models/api.models';

@Component({
  selector: 'app-ledger',
  standalone: true,
  imports: [FormsModule, CurrencyBrlPipe, MonthNavComponent, UserAvatarComponent, NgTemplateOutlet],
  templateUrl: './ledger.component.html',
  styleUrl: './ledger.component.scss',
})
export class LedgerComponent implements OnInit {
  private api = inject(FinanceApiService);

  kind = input.required<EntryKind>();
  title = input.required<string>();
  subtitle = input.required<string>();
  accent = input('#3fb950');

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  items = signal<Transaction[]>([]);
  settings = signal<AppSettings | null>(null);
  loading = signal(true);
  showForm = signal(false);
  editing = signal<Transaction | null>(null);

  form: Partial<Transaction> & { eurToBrl?: number } = {};

  categories = computed(() => {
    const k = this.kind();
    if (k === 'income') return ['Salário', 'Freela', 'Reembolso', 'Extra', 'Outros'];
    if (k === 'expense') return ['Brasil', 'Portugal', 'Moradia', 'Alimentação', 'Assinaturas', 'Outros'];
    return ['Investimentos', 'Reserva', 'Outros'];
  });

  monthTotal = computed(() =>
    this.items().reduce((s, t) => s + t.amountBrl, 0)
  );

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) => this.settings.set(s));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .getTransactions(this.year(), this.month() + 1, this.kind())
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onPeriodChange(): void {
    this.load();
  }

  openNew(): void {
    const d = new Date(this.year(), this.month(), new Date().getDate());
    const iso = d.toISOString().slice(0, 10);
    this.editing.set(null);
    this.form = {
      transactionDate: iso,
      kind: this.kind(),
      description: '',
      amount: 0,
      currency: 'BRL',
      category: this.categories()[0],
      region: 'geral',
    };
    this.showForm.set(true);
  }

  openEdit(tx: Transaction): void {
    if (this.editing()?.id === tx.id) {
      this.cancelForm();
      return;
    }
    this.editing.set(tx);
    this.form = { ...tx };
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editing.set(null);
  }

  save(): void {
    const s = this.settings();
    const body = {
      ...this.form,
      kind: this.kind(),
      eurToBrl: s?.eurToBrl ?? 6,
    };
    const id = this.editing()?.id;
    this.api.saveTransaction(body, id).subscribe({
      next: () => {
        this.cancelForm();
        this.load();
      },
    });
  }

  remove(id: number): void {
    if (!confirm('Excluir lançamento?')) return;
    this.api.deleteTransaction(id).subscribe(() => this.load());
  }

  formatDate(date: string): string {
    const [, m, d] = date.split('-');
    return `${d}/${m}`;
  }
}
