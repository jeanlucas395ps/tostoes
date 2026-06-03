import { Component, input, output, model, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Currency,
  EntryKind,
  FinancialAccount,
  MonthPlanEntry,
} from '../../../core/models/api.models';
import { entryAmount, formatMoneyWithBrl } from '../../../core/utils/money.util';

function accountBalanceLabel(a: FinancialAccount): string {
  return formatMoneyWithBrl(a.balance, a.currency, a.balanceBrl);
}

const KIND_LABELS: Record<EntryKind, string> = {
  income: 'Recebimento',
  expense: 'Gasto',
  investment: 'Investimento',
  leisure: 'Lazer',
};

export interface ConfirmAccountResult {
  accountId: number;
  targetAccountId?: number;
  amount: number;
  currency: Currency;
  kind: EntryKind;
}

@Component({
  selector: 'app-confirm-account-dialog',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './confirm-account-dialog.component.html',
  styleUrl: './confirm-account-dialog.component.scss',
})
export class ConfirmAccountDialogComponent {
  entry = input.required<MonthPlanEntry>();
  accounts = input<FinancialAccount[]>([]);
  amount = input<number | null>(null);

  bankAccountId = model<number | null>(null);
  investmentAccountId = model<number | null>(null);
  editAmount = model(0);
  editCurrency = model<Currency>('BRL');
  editKind = model<EntryKind>('expense');

  confirmed = output<ConfirmAccountResult>();
  cancelled = output<void>();

  readonly kindLabels = KIND_LABELS;
  readonly kindOptions: EntryKind[] = ['income', 'expense', 'investment', 'leisure'];

  isInvestment = computed(() => this.editKind() === 'investment');
  canEditKind = computed(() => !this.entry().recurringItemId);

  presetInvestmentAccountName = computed(
    () => this.entry().financialAccountName ?? null,
  );

  bankAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'bank').sort((a, b) => a.name.localeCompare(b.name))
  );

  investmentAccounts = computed(() =>
    this.accounts()
      .filter((a) => a.type === 'investment')
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  constructor() {
    effect(() => {
      const e = this.entry();
      const ext = this.amount();
      this.editAmount.set(ext ?? entryAmount(e));
      this.editCurrency.set(e.currency ?? 'BRL');
      this.editKind.set(e.kind);

      if (e.kind === 'investment') {
        if (e.financialAccountId && !this.investmentAccountId()) {
          this.investmentAccountId.set(e.financialAccountId);
        }
        if (e.sourceFinancialAccountId && !this.bankAccountId()) {
          this.bankAccountId.set(e.sourceFinancialAccountId);
        }
        if (!this.bankAccountId() && this.bankAccounts().length === 1) {
          this.bankAccountId.set(this.bankAccounts()[0].id);
        }
      } else if (e.sourceFinancialAccountId && !this.bankAccountId()) {
        this.bankAccountId.set(e.sourceFinancialAccountId);
      }
    });
  }

  accountBalanceLabel = accountBalanceLabel;

  canSubmit(): boolean {
    if (this.editAmount() <= 0 && this.editKind() !== 'income') {
      return false;
    }
    if (this.isInvestment()) {
      return !!this.bankAccountId() && !!this.investmentAccountId();
    }
    return !!this.bankAccountId();
  }

  submit(): void {
    const bank = this.bankAccountId();
    if (!bank) return;
    const base = {
      amount: this.editAmount(),
      currency: this.editCurrency(),
      kind: this.editKind(),
    };
    if (this.isInvestment()) {
      const inv = this.investmentAccountId();
      if (!inv) return;
      this.confirmed.emit({ accountId: bank, targetAccountId: inv, ...base });
      return;
    }
    this.confirmed.emit({ accountId: bank, ...base });
  }
}
