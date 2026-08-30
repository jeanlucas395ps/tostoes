import { Component, inject, input, output, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FinanceApiService } from '../../../core/services/finance-api.service';
import { AccountType, Currency, FinancialAccount } from '../../../core/models/api.models';
import { isForeignCurrency, previewBrl } from '../../../core/utils/money.util';

const DEFAULT_COLOR: Record<AccountType, string> = {
  bank: '#3b82f6',
  investment: '#a371f7',
  credit: '#f59e0b',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface AccountFormState {
  name: string;
  type: AccountType;
  currency: Currency;
  initialBalance: number;
  initialBalanceDate: string;
  color: string;
  creditLimit: number | null;
  closingDay: number | null;
  dueDay: number | null;
  cdiMonthlyRate: number | null;
}

@Component({
  selector: 'app-account-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './account-form.component.html',
  styleUrl: './account-form.component.scss',
})
export class AccountFormComponent {
  private api = inject(FinanceApiService);

  account = input<FinancialAccount | null>(null);
  fxRate = input(6.1);

  saved = output<void>();
  cancelled = output<void>();

  saving = signal(false);
  error = signal('');

  form: AccountFormState = this.blankForm('bank');

  constructor() {
    effect(() => {
      const a = this.account();
      this.form = a
        ? {
            name: a.name,
            type: a.type,
            currency: a.currency,
            initialBalance: a.initialBalance,
            initialBalanceDate: a.initialBalanceDate.slice(0, 10),
            color: a.color ?? DEFAULT_COLOR[a.type],
            creditLimit: a.creditLimit ?? 5000,
            closingDay: a.closingDay ?? 1,
            dueDay: a.dueDay ?? 10,
            cdiMonthlyRate: a.cdiMonthlyRate ?? null,
          }
        : this.blankForm('bank');
    });
  }

  private blankForm(type: AccountType): AccountFormState {
    return {
      name: '',
      type,
      currency: 'BRL',
      initialBalance: 0,
      initialBalanceDate: today(),
      color: DEFAULT_COLOR[type],
      creditLimit: 5000,
      closingDay: 1,
      dueDay: 10,
      cdiMonthlyRate: null,
    };
  }

  isEditing(): boolean {
    return !!this.account();
  }

  isCredit(): boolean {
    return this.form.type === 'credit';
  }

  isInvestment(): boolean {
    return this.form.type === 'investment';
  }

  isForeign(): boolean {
    return isForeignCurrency(this.form.currency);
  }

  balancePreviewBrl(): number {
    return previewBrl(this.form.initialBalance, this.form.currency, this.fxRate());
  }

  onTypeChange(): void {
    if (this.isEditing()) return;
    this.form.color = DEFAULT_COLOR[this.form.type];
  }

  save(): void {
    this.error.set('');
    if (!this.form.name.trim()) {
      this.error.set('Informe um nome.');
      return;
    }
    const payload: Partial<FinancialAccount> = {
      name: this.form.name.trim(),
      type: this.form.type,
      currency: this.form.currency,
      initialBalance: this.form.initialBalance,
      initialBalanceDate: this.form.initialBalanceDate,
      color: this.form.color,
      creditLimit: this.isCredit() ? this.form.creditLimit : null,
      closingDay: this.isCredit() ? this.form.closingDay : null,
      dueDay: this.isCredit() ? this.form.dueDay : null,
      cdiMonthlyRate: this.isInvestment() ? this.form.cdiMonthlyRate : null,
    };
    this.saving.set(true);
    this.api.saveAccount(payload, this.account()?.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err.error?.error ?? 'Não foi possível salvar a conta.');
      },
    });
  }
}
