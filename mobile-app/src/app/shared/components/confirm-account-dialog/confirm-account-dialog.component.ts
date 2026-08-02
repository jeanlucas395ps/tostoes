import { Component, input, output, model, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Currency, EntryKind, FinancialAccount, MonthPlanEntry } from '../../../core/models/api.models';
import { entryAmount, formatMoneyWithBrl, currencySymbol } from '../../../core/utils/money.util';
import { accountTypeShortLabel } from '../../../core/utils/account-labels.util';

function accountBalanceLabel(a: FinancialAccount): string {
  if (a.type === 'credit') {
    const used = a.usedLimit ?? Math.max(0, a.balance);
    const usedBrl = a.usedLimitBrl ?? a.balanceBrl;
    return `usado ${formatMoneyWithBrl(used, a.currency, usedBrl)}`;
  }
  return formatMoneyWithBrl(a.balance, a.currency, a.balanceBrl);
}

const KIND_LABELS: Record<EntryKind, string> = {
  income: 'Recebimento',
  expense: 'Gasto',
  investment: 'Investimento',
  leisure: 'Lazer',
  transfer: 'Transferência',
};

export interface ConfirmAccountResult {
  accountId: number;
  targetAccountId?: number;
  amount: number;
  currency: Currency;
  amountIn?: number;
  currencyIn?: Currency;
  kind: EntryKind;
}

@Component({
  selector: 'app-confirm-account-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './confirm-account-dialog.component.html',
  styleUrl: './confirm-account-dialog.component.scss',
})
export class ConfirmAccountDialogComponent {
  currencySymbol = currencySymbol;

  entry = input.required<MonthPlanEntry>();
  accounts = input<FinancialAccount[]>([]);
  amount = input<number | null>(null);
  title = input<string>('Confirmar');

  bankAccountId = model<number | null>(null);
  investmentAccountId = model<number | null>(null);
  sourceAccountId = model<number | null>(null);
  targetAccountId = model<number | null>(null);
  editAmount = model(0);
  editCurrency = model<Currency>('BRL');
  editAmountIn = model(0);
  editCurrencyIn = model<Currency>('BRL');
  editKind = model<EntryKind>('expense');

  confirmed = output<ConfirmAccountResult>();
  cancelled = output<void>();

  readonly kindLabels = KIND_LABELS;
  readonly kindOptions: EntryKind[] = ['income', 'expense', 'investment', 'leisure', 'transfer'];

  isInvestment = computed(() => this.editKind() === 'investment');
  isTransfer = computed(() => this.editKind() === 'transfer');
  canEditKind = computed(() => !this.entry().recurringItemId && !this.entry().isGoal);

  bankAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'bank').sort((a, b) => a.name.localeCompare(b.name))
  );

  paymentAccounts = computed(() =>
    this.accounts()
      .filter((a) => a.type === 'bank' || a.type === 'credit')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  );

  investmentAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'investment').sort((a, b) => a.name.localeCompare(b.name))
  );

  allAccounts = computed(() => [...this.accounts()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));

  /** Origem/destino do lançamento "simples" (não investimento/transferência). */
  defaultAccountOptions = computed(() =>
    this.editKind() === 'income' ? this.bankAccounts() : this.paymentAccounts()
  );

  accountTypeShort = accountTypeShortLabel;
  accountBalanceLabel = accountBalanceLabel;

  constructor() {
    effect(() => {
      const e = this.entry();
      const ext = this.amount();
      const amt = ext ?? entryAmount(e);
      this.editAmount.set(amt);
      this.editCurrency.set(e.currency ?? 'BRL');
      this.editAmountIn.set(amt);
      this.editCurrencyIn.set(e.currency ?? 'BRL');
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
      } else if (e.kind === 'transfer') {
        if (e.sourceFinancialAccountId && !this.sourceAccountId()) {
          this.sourceAccountId.set(e.sourceFinancialAccountId);
        }
        if (e.financialAccountId && !this.targetAccountId()) {
          this.targetAccountId.set(e.financialAccountId);
        }
      } else if (e.sourceFinancialAccountId && !this.bankAccountId()) {
        this.bankAccountId.set(e.sourceFinancialAccountId);
      }
    });
  }

  onOutCurrencyOrAmountChange(): void {
    if (this.editCurrency() === this.editCurrencyIn()) {
      this.editAmountIn.set(this.editAmount());
    }
  }

  canSubmit(): boolean {
    if (this.isTransfer()) {
      return (
        !!this.sourceAccountId() &&
        !!this.targetAccountId() &&
        this.sourceAccountId() !== this.targetAccountId() &&
        this.editAmount() > 0 &&
        this.editAmountIn() > 0
      );
    }
    if (this.editAmount() <= 0 && this.editKind() !== 'income') {
      return false;
    }
    if (this.isInvestment()) {
      return !!this.bankAccountId() && !!this.investmentAccountId();
    }
    return !!this.bankAccountId();
  }

  submit(): void {
    if (this.isTransfer()) {
      const source = this.sourceAccountId();
      const target = this.targetAccountId();
      if (!source || !target) return;
      this.confirmed.emit({
        accountId: source,
        targetAccountId: target,
        amount: this.editAmount(),
        currency: this.editCurrency(),
        amountIn: this.editAmountIn(),
        currencyIn: this.editCurrencyIn(),
        kind: 'transfer',
      });
      return;
    }

    const bank = this.bankAccountId();
    if (!bank) return;
    const base = { amount: this.editAmount(), currency: this.editCurrency(), kind: this.editKind() };
    if (this.isInvestment()) {
      const inv = this.investmentAccountId();
      if (!inv) return;
      this.confirmed.emit({ accountId: bank, targetAccountId: inv, ...base });
      return;
    }
    this.confirmed.emit({ accountId: bank, ...base });
  }
}
