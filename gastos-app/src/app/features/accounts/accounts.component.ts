import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, LowerCasePipe, SlicePipe } from '@angular/common';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import {
  AccountType,
  Currency,
  EntryKind,
  FinancialAccount,
} from '../../core/models/api.models';
import {
  formatMoney,
  formatMoneyWithBrl,
  previewBrl,
  isForeignCurrency,
  currencySymbol,
} from '../../core/utils/money.util';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [FormsModule, CurrencyBrlPipe, MonthNavComponent, SlicePipe, DecimalPipe, LowerCasePipe],
  templateUrl: './accounts.component.html',
  styleUrl: './accounts.component.scss',
})
export class AccountsComponent implements OnInit {
  private api = inject(FinanceApiService);

  summary = signal<{
    bank: number;
    investment: number;
    creditUsed?: number;
    creditLimit?: number;
    creditAvailable?: number;
    all: number;
  } | null>(null);
  accounts = signal<FinancialAccount[]>([]);
  selectedId = signal<number | null>(null);
  statement = signal<FinancialAccount | null>(null);
  loading = signal(true);
  showForm = signal(false);
  editing = signal<FinancialAccount | null>(null);

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  eurToBrl = signal(6.2);
  usdToBrl = signal(5.0);
  currencySymbol = currencySymbol;
  isForeignCurrency = isForeignCurrency;
  stmtKindFilter = signal<EntryKind | ''>('');
  stmtSearch = signal('');
  stmtFiltersActive = computed(
    () => !!this.stmtKindFilter() || !!this.stmtSearch().trim()
  );

  formatMoney = formatMoney;
  formatMoneyWithBrl = formatMoneyWithBrl;

  form = {
    name: '',
    type: 'bank' as AccountType,
    currency: 'BRL' as Currency,
    initialBalance: 0,
    creditLimit: 0 as number | null,
    closingDay: 1 as number | null,
    dueDay: 10 as number | null,
    initialBalanceDate: new Date().toISOString().slice(0, 10),
    color: '#3b82f6',
  };

  bankAccounts = computed(() => this.accounts().filter((a) => a.type === 'bank'));
  investmentAccounts = computed(() =>
    this.accounts().filter((a) => a.type === 'investment')
  );
  creditAccounts = computed(() => this.accounts().filter((a) => a.type === 'credit'));

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) => {
      this.eurToBrl.set(s.eurToBrlFallback ?? s.eurToBrl);
      this.usdToBrl.set(s.usdToBrlFallback ?? s.usdToBrl ?? 5);
    });
    this.loadSummary();
  }

  fxRateFor(currency: Currency): number {
    return currency === 'USD' ? this.usdToBrl() : this.eurToBrl();
  }

  accountBalanceLabel(a: FinancialAccount): string {
    if (a.type === 'credit') {
      const used = a.usedLimit ?? a.balance;
      const usedBrl = a.usedLimitBrl ?? a.balanceBrl;
      return formatMoneyWithBrl(used, a.currency, usedBrl);
    }
    return formatMoneyWithBrl(a.balance, a.currency, a.balanceBrl);
  }

  accountInitialLabel(a: FinancialAccount): string {
    const brl = a.initialBalanceBrl ?? previewBrl(a.initialBalance, a.currency, this.fxRateFor(a.currency));
    return formatMoneyWithBrl(a.initialBalance, a.currency, brl);
  }

  availableLabel(a: FinancialAccount): string {
    if (a.availableLimit == null) return '—';
    return formatMoneyWithBrl(
      a.availableLimit,
      a.currency,
      a.availableLimitBrl ?? a.availableLimit
    );
  }

  limitLabel(a: FinancialAccount): string {
    if (a.creditLimit == null) return '—';
    return formatMoneyWithBrl(
      a.creditLimit,
      a.currency,
      a.creditLimitBrl ?? a.creditLimit
    );
  }

  lineAmountLabel(line: { amount: number; amountBrl?: number; currency: Currency }, account: FinancialAccount): string {
    const brl = line.amountBrl ?? line.amount;
    if (isForeignCurrency(account.currency)) {
      return formatMoneyWithBrl(line.amount, account.currency, brl);
    }
    return formatMoney(line.amount, 'BRL');
  }

  lineSignedLabel(line: { signedAmount: number; signedAmountBrl?: number }, account: FinancialAccount): string {
    const brl = line.signedAmountBrl ?? line.signedAmount;
    const absNative = Math.abs(line.signedAmount);
    const absBrl = Math.abs(brl);
    if (isForeignCurrency(account.currency) && line.signedAmount !== 0) {
      const sign = line.signedAmount > 0 ? '+' : '−';
      return `${sign}${formatMoneyWithBrl(absNative, account.currency, absBrl)}`;
    }
    if (line.signedAmount === 0) return '—';
    const sign = line.signedAmount > 0 ? '+' : '−';
    return `${sign}${formatMoney(absNative, 'BRL')}`;
  }

  formInitialBrlPreview(): number {
    return previewBrl(this.form.initialBalance, this.form.currency, this.fxRateFor(this.form.currency));
  }

  lineBalanceLabel(line: { balanceAfter: number; balanceAfterBrl?: number }, account: FinancialAccount): string {
    const brl = line.balanceAfterBrl ?? line.balanceAfter;
    if (isForeignCurrency(account.currency)) {
      return formatMoneyWithBrl(line.balanceAfter, account.currency, brl);
    }
    return formatMoney(line.balanceAfter, 'BRL');
  }

  loadSummary(): void {
    this.loading.set(true);
    this.api.getAccountsSummary().subscribe({
      next: (s) => {
        this.summary.set(s.totals);
        this.accounts.set(s.accounts);
        this.loading.set(false);
        const sel = this.selectedId();
        if (sel) this.loadStatement(sel);
      },
      error: () => this.loading.set(false),
    });
  }

  loadStatement(id: number): void {
    this.selectedId.set(id);
    const kind = this.stmtKindFilter();
    const search = this.stmtSearch().trim();
    this.api
      .getAccount(id, this.year(), this.month() + 1, {
        kind: kind || undefined,
        search: search || undefined,
      })
      .subscribe({
        next: (r) => this.statement.set(r.item),
      });
  }

  applyStatementFilters(): void {
    const id = this.selectedId();
    if (id) this.loadStatement(id);
  }

  clearStatementFilters(): void {
    this.stmtKindFilter.set('');
    this.stmtSearch.set('');
    this.applyStatementFilters();
  }

  selectAccount(a: FinancialAccount): void {
    this.loadStatement(a.id);
  }

  onYearChange(y: number): void {
    this.year.set(y);
    const id = this.selectedId();
    if (id) this.loadStatement(id);
  }

  onMonthChange(m: number): void {
    this.month.set(m);
    const id = this.selectedId();
    if (id) this.loadStatement(id);
  }

  openNew(type: AccountType = 'bank'): void {
    this.editing.set(null);
    this.form = {
      name: '',
      type,
      currency: 'BRL',
      initialBalance: 0,
      creditLimit: type === 'credit' ? 5000 : null,
      closingDay: type === 'credit' ? 1 : null,
      dueDay: type === 'credit' ? 10 : null,
      initialBalanceDate: new Date().toISOString().slice(0, 10),
      color: type === 'investment' ? '#a371f7' : type === 'credit' ? '#f59e0b' : '#3b82f6',
    };
    this.showForm.set(true);
  }

  openEdit(a: FinancialAccount): void {
    this.editing.set(a);
    this.form = {
      name: a.name,
      type: a.type,
      currency: a.currency,
      initialBalance: a.initialBalance,
      creditLimit: a.creditLimit ?? null,
      closingDay: a.closingDay ?? null,
      dueDay: a.dueDay ?? null,
      initialBalanceDate: a.initialBalanceDate,
      color: a.color ?? '#3b82f6',
    };
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editing.set(null);
  }

  save(): void {
    const name = this.form.name.trim();
    if (!name) return;
    const isCredit = this.form.type === 'credit';
    const payload: Partial<FinancialAccount> = {
      name,
      type: this.form.type,
      currency: this.form.currency,
      initialBalance: this.form.initialBalance,
      initialBalanceDate: this.form.initialBalanceDate,
      color: this.form.color,
      creditLimit: isCredit ? this.form.creditLimit : null,
      closingDay: isCredit ? this.form.closingDay : null,
      dueDay: isCredit ? this.form.dueDay : null,
    };
    const id = this.editing()?.id;
    this.api.saveAccount(payload, id).subscribe({
      next: (r) => {
        this.cancelForm();
        this.loadSummary();
        if (r.item.id) this.loadStatement(r.item.id);
      },
    });
  }

  remove(a: FinancialAccount): void {
    const label = a.type === 'credit' ? 'cartão' : 'conta';
    if (!confirm(`Remover ${label} "${a.name}"?`)) return;
    this.api.deleteAccount(a.id).subscribe(() => {
      if (this.selectedId() === a.id) {
        this.selectedId.set(null);
        this.statement.set(null);
      }
      this.loadSummary();
    });
  }

  typeLabel(type: AccountType): string {
    if (type === 'investment') return 'Investimento';
    if (type === 'credit') return 'Cartão de crédito';
    return 'Banco';
  }

  lineKindLabel(kind: string, isCredit = false): string {
    if (kind === 'opening') return isCredit ? 'Dívida inicial' : 'Saldo inicial';
    if (kind === 'income') return isCredit ? 'Pagamento / crédito' : 'Entrada';
    if (kind === 'investment') return 'Aporte';
    if (kind === 'transfer') return 'Transferência';
    return isCredit ? 'Compra' : 'Saída';
  }
}
