import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import {
  Currency,
  EntryKind,
  FinancialAccount,
  InvestmentType,
  PlanningCustomTab,
  PlanningItemCategory,
  RecurringItem,
  User,
  UserRef,
} from '../../core/models/api.models';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { responsibleLabel } from '../../core/utils/responsible.util';
import {
  entryAmount,
  formatMoneyWithBrl,
  previewBrl,
  currencySymbol,
  isForeignCurrency,
} from '../../core/utils/money.util';
import {
  CATEGORY_ICON_OPTIONS,
  categoryIcon,
  categoryLucideNodes,
  resolveItemIcon,
  suggestCategoryIcon,
} from '../../core/utils/category-icon.util';
import {
  buildDonutSlices,
  CATEGORY_PIE_COLORS,
} from '../../core/utils/donut-chart.util';
import { LucideSvgComponent } from '../../shared/components/lucide-svg/lucide-svg.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import type { IconNode } from 'lucide';

export interface FixedPageMeta {
  kind: EntryKind;
  title: string;
  subtitle: string;
  accent: string;
  categoryDefault: string;
  userOverviewTabs?: boolean;
  /** Compras parceladas (gasto com início/fim). */
  installmentMode?: boolean;
}

export interface UserOverviewTab {
  key: 'all' | 'conjunto' | number;
  label: string;
  count: number;
  totalBrl: number;
}

type TabFilter = 'all' | 'geral' | number;
type UserTabFilter = 'all' | 'conjunto' | number;
type CategoryFilter = 'all' | 'sem' | number;

@Component({
  selector: 'app-fixed-items',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyBrlPipe,
    DecimalPipe,
    NgTemplateOutlet,
    RouterLink,
    UserAvatarComponent,
    LucideSvgComponent,
    SkeletonComponent,
  ],
  templateUrl: './fixed-items.component.html',
  styleUrl: './fixed-items.component.scss',
})
export class FixedItemsComponent implements OnInit {
  private api = inject(FinanceApiService);
  private route = inject(ActivatedRoute);

  meta = signal<FixedPageMeta>({
    kind: 'expense',
    title: 'Itens fixos',
    subtitle: '',
    accent: '#f85149',
    categoryDefault: 'Geral',
  });

  items = signal<RecurringItem[]>([]);
  customTabs = signal<PlanningCustomTab[]>([]);
  itemCategories = signal<PlanningItemCategory[]>([]);
  investmentTypes = signal<InvestmentType[]>([]);
  householdUsers = signal<User[]>([]);
  loading = signal(true);
  showForm = signal(false);
  editing = signal<RecurringItem | null>(null);
  investmentFinancialAccounts = signal<FinancialAccount[]>([]);
  bankFinancialAccounts = signal<FinancialAccount[]>([]);
  eurToBrl = signal(6.2);
  usdToBrl = signal(5.0);
  currencySymbol = currencySymbol;
  isForeignCurrency = isForeignCurrency;
  activeTab = signal<TabFilter>('all');
  activeUserTab = signal<UserTabFilter>('all');
  activeCategory = signal<CategoryFilter>('all');
  newCategoryMode = signal(false);
  categoryIconOptions = CATEGORY_ICON_OPTIONS;
  advancePrompt = signal<RecurringItem | null>(null);
  advanceBankId = signal<number | null>(null);
  advanceAmount = signal(0);
  advanceDate = signal(new Date().toISOString().slice(0, 10));
  pureBankAccounts = computed(() =>
    this.bankFinancialAccounts().filter((a) => a.type === 'bank')
  );
  creditFinancialAccounts = computed(() =>
    this.bankFinancialAccounts().filter((a) => a.type === 'credit')
  );

  form: Partial<RecurringItem> & {
    currency?: Currency;
    amount?: number;
    newCategoryName?: string;
    newCategoryIcon?: string;
    /** YYYY-MM no formulário de parcelas */
    startMonth?: string;
    endMonth?: string;
    installmentCount?: number;
  } = {};

  isInvestment = computed(() => this.meta().kind === 'investment');
  isInstallmentMode = computed(() => this.meta().installmentMode === true);
  usesCustomTabs = computed(() => {
    const k = this.meta().kind;
    return (k === 'expense' || k === 'income') && !this.isInstallmentMode();
  });

  useUserOverviewTabs = computed(() => this.meta().userOverviewTabs === true);

  userTabOverviews = computed((): UserOverviewTab[] => {
    const items = this.items();
    const users = this.householdUsers();
    const sumBrl = (list: RecurringItem[]) =>
      list.reduce((acc, i) => acc + this.itemMonthlyBrl(i), 0);

    const conjunto = items.filter((i) => !i.responsibleUserId);
    const tabs: UserOverviewTab[] = [
      {
        key: 'all',
        label: 'Total',
        count: items.length,
        totalBrl: sumBrl(items),
      },
    ];

    if (conjunto.length > 0) {
      tabs.push({
        key: 'conjunto',
        label: 'Conjunto',
        count: conjunto.length,
        totalBrl: sumBrl(conjunto),
      });
    }

    const tabbedUserIds = new Set<number>();

    for (const u of users) {
      tabbedUserIds.add(u.id);
      const mine = items.filter((i) => i.responsibleUserId === u.id);
      tabs.push({
        key: u.id,
        label: u.name,
        count: mine.length,
        totalBrl: sumBrl(mine),
      });
    }

    for (const item of items) {
      const id = item.responsibleUserId;
      if (id == null || tabbedUserIds.has(id)) continue;
      tabbedUserIds.add(id);
      const mine = items.filter((i) => i.responsibleUserId === id);
      tabs.push({
        key: id,
        label: item.responsibleUser?.name ?? item.responsible ?? 'Outro',
        count: mine.length,
        totalBrl: sumBrl(mine),
      });
    }

    return tabs;
  });

  activeUserOverview = computed(() => {
    const key = this.activeUserTab();
    return this.userTabOverviews().find((t) => t.key === key) ?? this.userTabOverviews()[0];
  });

  itemsByUserTab = computed(() => {
    const list = this.items();
    if (!this.useUserOverviewTabs()) return list;
    const tab = this.activeUserTab();
    if (tab === 'all') return list;
    if (tab === 'conjunto') return list.filter((i) => !i.responsibleUserId);
    return list.filter((i) => i.responsibleUserId === tab);
  });

  itemsByTab = computed(() => {
    const list = this.itemsByUserTab();
    const tab = this.activeTab();
    if (!this.usesCustomTabs() || tab === 'all') return list;
    if (tab === 'geral') return list.filter((i) => !i.customTabId);
    return list.filter((i) => i.customTabId === tab);
  });

  filteredItems = computed(() => {
    const list = this.itemsByTab();
    const cat = this.activeCategory();
    if (cat === 'all') return list;
    if (cat === 'sem') return list.filter((i) => !i.itemCategoryId);
    return list.filter((i) => i.itemCategoryId === cat);
  });

  categoryFilters = computed(() => {
    const list = this.itemsByTab();
    const counts = new Map<number | 'sem', number>();
    for (const item of list) {
      const key = item.itemCategoryId ?? 'sem';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const filters: {
      id: CategoryFilter;
      name: string;
      icon: string;
      count: number;
    }[] = [{ id: 'all', name: 'Todas', icon: '⊞', count: list.length }];
    for (const cat of this.itemCategories()) {
      const n = counts.get(cat.id) ?? 0;
      if (n > 0) {
        filters.push({
          id: cat.id,
          name: cat.name,
          icon: categoryIcon(cat.name, cat.icon),
          count: n,
        });
      }
    }
    const sem = counts.get('sem') ?? 0;
    if (sem > 0) {
      filters.push({ id: 'sem', name: 'Sem categoria', icon: 'pin', count: sem });
    }
    return filters;
  });

  showCategoryFilters = computed(
    () => this.categoryFilters().length > 2 && this.itemCategories().length > 0
  );

  showCategoryPie = computed(() => this.meta().kind === 'expense');

  categoryPieChart = computed(() => {
    if (!this.showCategoryPie()) return null;

    const buckets = new Map<
      string,
      { label: string; icon: string; value: number }
    >();

    for (const item of this.itemsByTab()) {
      const key =
        item.itemCategoryId != null ? String(item.itemCategoryId) : 'sem';
      const label =
        item.itemCategoryName ?? item.category ?? 'Sem categoria';
      const icon = this.itemCategoryIcon(item);
      const value = this.itemMonthlyBrl(item);
      const existing = buckets.get(key);
      if (existing) {
        existing.value += value;
      } else {
        buckets.set(key, { label, icon, value });
      }
    }

    const sorted = [...buckets.values()]
      .filter((b) => b.value > 0.001)
      .sort((a, b) => b.value - a.value);

    const colored = sorted.map((b, i) => ({
      ...b,
      color: CATEGORY_PIE_COLORS[i % CATEGORY_PIE_COLORS.length],
    }));

    const built = buildDonutSlices(colored);
    if (!built) return null;

    return {
      slices: built.slices,
      total: built.total,
    };
  });

  tabCounts = computed(() => {
    const list = this.itemsByUserTab();
    const counts: Record<string, number> = { all: list.length, geral: 0 };
    for (const t of this.customTabs()) {
      counts[String(t.id)] = 0;
    }
    for (const i of list) {
      if (!i.customTabId) {
        counts['geral']++;
      } else {
        const key = String(i.customTabId);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  });

  responsibleLabel = responsibleLabel;
  formatMoneyWithBrl = formatMoneyWithBrl;
  entryAmount = entryAmount;

  /** Utilizador do planejamento para exibir avatar (campo responsável do formulário). */
  householdUserById(id: number): User | undefined {
    return this.householdUsers().find((u) => u.id === id);
  }

  responsibleAvatarUser(item: RecurringItem): User | UserRef | null {
    if (item.responsibleUser) {
      const u = item.responsibleUser;
      const full = this.householdUserById(u.id);
      return full ?? u;
    }
    const id = item.responsibleUserId;
    if (id != null) {
      return this.householdUserById(id) ?? null;
    }
    return null;
  }

  responsibleAvatarName(item: RecurringItem): string {
    return this.responsibleAvatarUser(item)?.name ?? this.responsibleLabel(item);
  }

  userForTabKey(key: UserTabFilter): User | null {
    if (typeof key !== 'number') return null;
    return this.householdUserById(key) ?? null;
  }

  formPreviewBrl = computed(() => {
    const cur = this.form.currency ?? 'BRL';
    const rate = cur === 'USD' ? this.usdToBrl() : this.eurToBrl();
    return previewBrl(this.form.amount ?? 0, cur, rate);
  });

  ngOnInit(): void {
    const data = this.route.snapshot.data as Partial<FixedPageMeta>;
    if (data['kind']) {
      this.meta.set({
        kind: data['kind'] as EntryKind,
        title: data['title'] ?? 'Itens fixos',
        subtitle: data['subtitle'] ?? '',
        accent: data['accent'] ?? '#58a6ff',
        categoryDefault: data['categoryDefault'] ?? 'Geral',
        userOverviewTabs: data['userOverviewTabs'] === true,
        installmentMode: data['installmentMode'] === true,
      });
    }
    this.activeTab.set('all');
    this.activeUserTab.set('all');
    this.activeCategory.set('all');
    this.api.getSettings().subscribe((s) => {
      this.eurToBrl.set(s.eurToBrlFallback ?? s.eurToBrl);
      this.usdToBrl.set(s.usdToBrlFallback ?? s.usdToBrl ?? 5);
    });
    this.loadTaxonomy();
    this.load();
    this.api.getHouseholdUsers().subscribe((r) => this.householdUsers.set(r.items));
    this.api.getAccounts().subscribe((r) => {
      const kind = this.meta().kind;
      const paymentTypes =
        kind === 'expense' || kind === 'leisure' || this.isInstallmentMode()
          ? (['bank', 'credit'] as const)
          : (['bank'] as const);
      this.bankFinancialAccounts.set(
        r.items.filter((a) => (paymentTypes as readonly string[]).includes(a.type))
      );
    });
    if (this.isInvestment()) {
      this.api.getInvestmentTypes().subscribe((r) => this.investmentTypes.set(r.items));
      this.api.getAccounts('investment').subscribe((r) => {
        this.investmentFinancialAccounts.set(r.items);
        if (this.showForm() && !this.form.financialAccountId && r.items.length) {
          this.form.financialAccountId = r.items[0].id;
        }
      });
    }
  }

  loadTaxonomy(): void {
    this.api.getPlanningTaxonomy().subscribe({
      next: (t) => {
        this.customTabs.set(t.customTabs);
        this.itemCategories.set(t.itemCategories);
        // Recebimentos fixos: manter «Todos» como aba padrão (não pular para a 1ª aba personalizada).
        if (
          this.usesCustomTabs() &&
          !this.useUserOverviewTabs() &&
          this.meta().kind !== 'income' &&
          this.activeTab() === 'all' &&
          t.customTabs.length
        ) {
          this.activeTab.set(t.customTabs[0].id);
        }
      },
    });
  }

  load(): void {
    this.loading.set(true);
    const kind = this.meta().kind;
    const installments = this.isInstallmentMode();
    this.api.getRecurringItems(kind, installments).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setUserTab(tab: UserTabFilter): void {
    this.activeUserTab.set(tab);
    this.activeCategory.set('all');
  }

  setTab(tab: TabFilter): void {
    this.activeTab.set(tab);
    this.activeCategory.set('all');
  }

  itemMonthlyBrl(item: RecurringItem): number {
    const currency = item.currency ?? 'BRL';
    const storedBrl = item.defaultAmountBrl ?? 0;
    if (currency === 'BRL') {
      return storedBrl > 0 ? storedBrl : entryAmount(item);
    }
    if (storedBrl > 0) {
      return storedBrl;
    }
    const rate = currency === 'USD' ? this.usdToBrl() : this.eurToBrl();
    return previewBrl(entryAmount(item), currency, rate);
  }

  setCategory(cat: CategoryFilter): void {
    this.activeCategory.set(cat);
  }

  categoryIconFor = categoryIcon;
  lucideFor = (icon: string | null | undefined): IconNode => categoryLucideNodes(icon);

  itemCategoryIcon(item: RecurringItem): string {
    return resolveItemIcon(
      item.itemCategoryName ?? item.category,
      item.itemCategoryIcon,
      item.name
    );
  }

  defaultTabId(): number | null {
    const tabs = this.customTabs();
    return tabs.length ? tabs[0].id : null;
  }

  defaultInvestmentAccountId(): number | null {
    const list = this.investmentFinancialAccounts();
    return list.length ? list[0].id : null;
  }

  defaultBankAccountId(): number | null {
    const list = this.bankFinancialAccounts();
    return list.length ? list[0].id : null;
  }

  defaultCategoryId(): number | null {
    const cats = this.itemCategories();
    const match = cats.find(
      (c) => c.name.toLowerCase() === this.meta().categoryDefault.toLowerCase()
    );
    return match?.id ?? cats[0]?.id ?? null;
  }

  openNew(): void {
    this.editing.set(null);
    this.newCategoryMode.set(false);
    const now = new Date();
    const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.form = {
      kind: this.meta().kind,
      category: this.meta().categoryDefault,
      itemCategoryId: this.defaultCategoryId(),
      customTabId: this.usesCustomTabs() ? this.defaultTabId() : null,
      region: 'geral',
      dueDay: 1,
      currency: 'BRL',
      amount: 0,
      responsibleUserId: null,
      financialAccountId: null,
      sourceFinancialAccountId: null,
      isInstallment: this.isInstallmentMode(),
      startMonth: this.isInstallmentMode() ? startMonth : undefined,
      installmentCount: this.isInstallmentMode() ? 12 : undefined,
      endMonth: this.isInstallmentMode()
        ? this.endMonthFromStart(startMonth, 12)
        : undefined,
    };
    this.showForm.set(true);
  }

  openEdit(item: RecurringItem): void {
    if (this.editing()?.id === item.id) {
      this.cancelForm();
      return;
    }
    this.editing.set(item);
    this.newCategoryMode.set(false);
    const startMonth = item.startDate ? item.startDate.slice(0, 7) : undefined;
    const endMonth = item.endDate ? item.endDate.slice(0, 7) : undefined;
    this.form = {
      ...item,
      currency: item.currency ?? 'BRL',
      amount: entryAmount(item),
      itemCategoryId: item.itemCategoryId ?? this.defaultCategoryId(),
      customTabId: item.customTabId ?? this.defaultTabId(),
      financialAccountId: item.financialAccountId ?? null,
      sourceFinancialAccountId: item.sourceFinancialAccountId ?? null,
      isInstallment: item.isInstallment ?? this.isInstallmentMode(),
      startMonth,
      endMonth,
      installmentCount:
        startMonth && endMonth
          ? this.monthsBetween(startMonth, endMonth)
          : undefined,
    };
    this.showForm.set(true);
  }

  /** Número de parcelas inclusivo entre YYYY-MM e YYYY-MM. */
  monthsBetween(startYm: string, endYm: string): number {
    const [sy, sm] = startYm.split('-').map(Number);
    const [ey, em] = endYm.split('-').map(Number);
    return (ey - sy) * 12 + (em - sm) + 1;
  }

  endMonthFromStart(startYm: string, count: number): string {
    const [y, m] = startYm.split('-').map(Number);
    const d = new Date(y, m - 1 + Math.max(1, count) - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  onInstallmentStartOrCountChange(): void {
    const start = this.form.startMonth;
    const count = this.form.installmentCount ?? 1;
    if (start) {
      this.form.endMonth = this.endMonthFromStart(start, count);
    }
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editing.set(null);
    this.newCategoryMode.set(false);
  }

  onCategorySelect(value: string | number | null): void {
    if (value === '__new__') {
      this.newCategoryMode.set(true);
      this.form.itemCategoryId = null;
      this.form.newCategoryName = '';
      this.form.newCategoryIcon = suggestCategoryIcon('');
      return;
    }
    this.newCategoryMode.set(false);
    const id = typeof value === 'number' ? value : value ? Number(value) : null;
    this.form.itemCategoryId = Number.isFinite(id) ? id : null;
    const cat = this.itemCategories().find((c) => c.id === this.form.itemCategoryId);
    if (cat) this.form.category = cat.name;
  }

  save(): void {
    const name = this.form.name?.trim();
    if (!name) return;
    if (this.isInvestment()) {
      this.form.financialAccountId = this.form.financialAccountId || null;
      this.form.sourceFinancialAccountId = this.form.sourceFinancialAccountId || null;
    } else {
      this.form.sourceFinancialAccountId = this.form.sourceFinancialAccountId || null;
      this.form.financialAccountId = null;
    }
    if (this.isInstallmentMode()) {
      if (!this.form.startMonth || !this.form.endMonth) {
        alert('Informe o mês de início e o mês da última parcela.');
        return;
      }
      if (this.form.startMonth > this.form.endMonth) {
        alert('O mês de início deve ser anterior ou igual ao da última parcela.');
        return;
      }
      const cardId = this.form.sourceFinancialAccountId;
      const isCredit =
        !!cardId && this.creditFinancialAccounts().some((a) => a.id === cardId);
      if (!isCredit) {
        alert('Vincule um cartão de crédito à compra parcelada.');
        return;
      }
      this.form.isInstallment = true;
      this.form.startDate = `${this.form.startMonth}-01`;
      // Último dia do mês final não é necessário: sync usa YYYY-MM
      this.form.endDate = `${this.form.endMonth}-01`;
    } else {
      this.form.isInstallment = false;
      this.form.startDate = null;
      this.form.endDate = null;
    }
    const id = this.editing()?.id;
    const payload = {
      ...this.form,
      kind: this.meta().kind,
      name,
      newCategoryName: this.newCategoryMode() ? this.form.newCategoryName?.trim() : undefined,
      newCategoryIcon: this.newCategoryMode() ? this.form.newCategoryIcon : undefined,
    };
    this.api.saveRecurringItem(payload, id).subscribe({
      next: () => {
        this.cancelForm();
        this.loadTaxonomy();
        this.load();
      },
    });
  }

  remove(item: RecurringItem): void {
    if (!confirm(`Remover "${item.name}"?`)) return;
    this.api.deleteRecurringItem(item.id).subscribe(() => this.load());
  }

  onNewCategoryNameChange(name: string): void {
    this.form.newCategoryName = name;
    if (this.newCategoryMode()) {
      this.form.newCategoryIcon = suggestCategoryIcon(name);
    }
  }

  /** Conta(s) vinculadas para exibir na listagem. */
  itemAccountLabel(item: RecurringItem): string | null {
    const kind = this.meta().kind;
    if (kind === 'investment') {
      const src = item.sourceFinancialAccountName?.trim();
      const dest = item.financialAccountName?.trim();
      if (src && dest) return `${src} → ${dest}`;
      if (src) return `Saída: ${src}`;
      if (dest) return `Entrada: ${dest}`;
      return null;
    }
    const bank = item.sourceFinancialAccountName?.trim();
    if (!bank) return null;
    const isCard = item.sourceFinancialAccountId
      ? this.bankFinancialAccounts().find((a) => a.id === item.sourceFinancialAccountId)?.type === 'credit'
      : false;
    const prefix = isCard ? 'Cartão' : 'Banco';
    return kind === 'income' ? `${prefix} (destino): ${bank}` : `${prefix}: ${bank}`;
  }

  itemSubtitle(item: RecurringItem): string {
    const parts = [`Dia ${item.dueDay ?? '?'}`];
    if (item.isInstallment && item.startDate && item.endDate) {
      const start = item.startDate.slice(0, 7);
      const end = item.endDate.slice(0, 7);
      const n = this.monthsBetween(start, end);
      parts.push(`${this.formatYm(start)} → ${this.formatYm(end)} (${n}x)`);
    }
    if (item.itemCategoryName || item.category) {
      parts.push(item.itemCategoryName ?? item.category);
    }
    if (this.usesCustomTabs() && item.customTabName) {
      parts.push(item.customTabName);
    }
    return parts.join(' · ');
  }

  private formatYm(ym: string): string {
    const [y, m] = ym.split('-');
    const names = [
      'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
      'jul', 'ago', 'set', 'out', 'nov', 'dez',
    ];
    const mi = Number(m) - 1;
    return `${names[mi] ?? m}/${y}`;
  }

  itemLabel(item: RecurringItem): string {
    const brl = this.itemMonthlyBrl(item);
    return formatMoneyWithBrl(entryAmount(item), item.currency ?? 'BRL', brl);
  }

  canAdvance(item: RecurringItem): boolean {
    if (!this.isInstallmentMode() || !item.sourceFinancialAccountId) return false;
    return this.creditFinancialAccounts().some((a) => a.id === item.sourceFinancialAccountId);
  }

  openAdvance(item: RecurringItem): void {
    if (!this.canAdvance(item)) {
      alert('Vincule um cartão de crédito nesta compra parcelada para adiantar.');
      return;
    }
    const banks = this.pureBankAccounts();
    this.advanceBankId.set(banks[0]?.id ?? null);
    this.advanceAmount.set(entryAmount(item));
    this.advanceDate.set(new Date().toISOString().slice(0, 10));
    this.advancePrompt.set(item);
  }

  cancelAdvance(): void {
    this.advancePrompt.set(null);
  }

  submitAdvance(): void {
    const item = this.advancePrompt();
    const bankId = this.advanceBankId();
    const cardId = item?.sourceFinancialAccountId;
    const amount = this.advanceAmount();
    if (!item || !bankId || !cardId || amount <= 0) return;

    this.api
      .advanceAccountPayment(cardId, {
        sourceAccountId: bankId,
        amount,
        currency: item.currency ?? 'BRL',
        transactionDate: this.advanceDate(),
        description: `Adiantamento · ${item.name}`,
        itemNames: [item.name],
      })
      .subscribe({
        next: () => {
          this.advancePrompt.set(null);
          alert('Adiantamento registrado: transferência confirmada para o cartão.');
        },
        error: (err) =>
          alert(err?.error?.error ?? 'Não foi possível registrar o adiantamento.'),
      });
  }
}
