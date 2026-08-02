import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import {
  Currency,
  EntryKind,
  FinancialAccount,
  InvestmentType,
  PlanningCustomTab,
  PlanningItemCategory,
  RecurringItem,
  User,
} from '../../core/models/api.models';
import { CATEGORY_ICON_OPTIONS, categoryLucideNodes, resolveItemIcon, suggestCategoryIcon } from '../../core/utils/category-icon.util';
import { LucideSvgComponent } from '../../shared/components/lucide-svg/lucide-svg.component';
import type { IconNode } from 'lucide';
import { responsibleLabel } from '../../core/utils/responsible.util';
import { formatMoneyWithBrl, previewBrl, isForeignCurrency } from '../../core/utils/money.util';
import { installmentEndMonth, clampInstallmentCount } from '../../core/utils/installment.util';
import { buildDonutSlices } from '../../core/utils/donut-chart.util';

interface FixedItemsRouteData {
  kind: EntryKind;
  title: string;
  subtitle: string;
  accent: string;
  categoryDefault: string;
  userOverviewTabs?: boolean;
  installmentMode?: boolean;
}

interface ItemFormState {
  name: string;
  dueDay: number | null;
  currency: Currency;
  amount: number;
  customTabId: number | null;
  itemCategoryId: number | null;
  newCategoryName: string;
  newCategoryIcon: string;
  responsibleUserId: number | null;
  sourceFinancialAccountId: number | null;
  financialAccountId: number | null;
  investmentTypeId: number | null;
  startMonth: string;
  installmentCount: number;
}

type UserTabKey = 'all' | 'conjunto' | number;

@Component({
  selector: 'app-fixed-items',
  standalone: true,
  imports: [
    FormsModule,
    SlicePipe,
    CurrencyBrlPipe,
    UserAvatarComponent,
    LucideSvgComponent,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
  ],
  templateUrl: './fixed-items.page.html',
  styleUrl: './fixed-items.page.scss',
})
export class FixedItemsPage implements OnInit {
  private api = inject(FinanceApiService);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  meta = this.route.snapshot.data as FixedItemsRouteData;

  items = signal<RecurringItem[]>([]);
  householdUsers = signal<User[]>([]);
  customTabs = signal<PlanningCustomTab[]>([]);
  itemCategories = signal<PlanningItemCategory[]>([]);
  bankFinancialAccounts = signal<FinancialAccount[]>([]);
  investmentFinancialAccounts = signal<FinancialAccount[]>([]);
  investmentTypes = signal<InvestmentType[]>([]);
  eurToBrl = signal(6.1);
  usdToBrl = signal(5.1);
  loading = signal(true);

  activeUserTab = signal<UserTabKey>('all');
  showForm = signal(false);
  editingId = signal<number | null>(null);
  newCategoryMode = signal(false);
  saving = signal(false);
  error = signal('');

  categoryIconOptions = CATEGORY_ICON_OPTIONS;
  responsibleLabel = responsibleLabel;
  isForeignCurrency = isForeignCurrency;
  entryIcon = (i: RecurringItem) => resolveItemIcon(i.itemCategoryName ?? i.category, i.itemCategoryIcon, i.name);
  lucideFor = (icon: string | null | undefined): IconNode => categoryLucideNodes(icon);

  form: ItemFormState = this.blankForm();

  isInstallmentMode(): boolean {
    return this.meta.installmentMode === true;
  }

  isInvestment(): boolean {
    return this.meta.kind === 'investment';
  }

  usesCustomTabs(): boolean {
    return (this.meta.kind === 'expense' || this.meta.kind === 'income') && !this.isInstallmentMode();
  }

  showCategoryPicker(): boolean {
    return !this.isInvestment();
  }

  showCategoryPie(): boolean {
    return this.meta.kind === 'expense';
  }

  itemsByUserTab = computed(() => {
    const tab = this.activeUserTab();
    const all = this.items();
    if (tab === 'all') return all;
    if (tab === 'conjunto') return all.filter((i) => i.responsibleUserId == null);
    return all.filter((i) => i.responsibleUserId === tab);
  });

  userTabOverviews = computed(() => {
    if (!this.meta.userOverviewTabs) return [];
    const all = this.items();
    const totalOf = (list: RecurringItem[]) => list.reduce((s, i) => s + (i.amount ?? i.defaultAmountBrl ?? 0), 0);

    const tabs: { key: UserTabKey; label: string; totalBrl: number; count: number }[] = [
      { key: 'all', label: 'Total', totalBrl: totalOf(all), count: all.length },
    ];
    const conjunto = all.filter((i) => i.responsibleUserId == null);
    if (conjunto.length) {
      tabs.push({ key: 'conjunto', label: 'Conjunto', totalBrl: totalOf(conjunto), count: conjunto.length });
    }
    for (const u of this.householdUsers()) {
      const mine = all.filter((i) => i.responsibleUserId === u.id);
      tabs.push({ key: u.id, label: u.name, totalBrl: totalOf(mine), count: mine.length });
    }
    return tabs;
  });

  categoryDonut = computed(() => {
    if (!this.showCategoryPie()) return null;
    const byCategory = new Map<string, number>();
    for (const i of this.itemsByUserTab()) {
      const label = i.itemCategoryName ?? i.category;
      byCategory.set(label, (byCategory.get(label) ?? 0) + (i.amount ?? i.defaultAmountBrl ?? 0));
    }
    const items = Array.from(byCategory.entries()).map(([label, value], idx) => ({
      label,
      value,
      color: DONUT_PALETTE[idx % DONUT_PALETTE.length],
    }));
    return buildDonutSlices(items);
  });

  endMonthFromStart = computed(() => {
    if (!this.form.startMonth) return '';
    const [y, m] = this.form.startMonth.split('-').map(Number);
    return installmentEndMonth(y, m - 1, this.form.installmentCount);
  });

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) => {
      this.eurToBrl.set(s.eurToBrlFallback ?? s.eurToBrl);
      this.usdToBrl.set(s.usdToBrlFallback ?? s.usdToBrl ?? 5);
    });
    this.api.getPlanningTaxonomy().subscribe((t) => {
      this.customTabs.set(t.customTabs);
      this.itemCategories.set(t.itemCategories);
      if (this.usesCustomTabs() && !this.meta.userOverviewTabs && this.meta.kind !== 'income' && t.customTabs.length) {
        this.form.customTabId = t.customTabs[0].id;
      }
    });
    this.api.getHouseholdUsers().subscribe((r) => this.householdUsers.set(r.items));
    this.api.getAccounts('bank').subscribe((r) => this.bankFinancialAccounts.set(r.items));
    if (this.isInvestment()) {
      this.api.getInvestmentTypes().subscribe((r) => this.investmentTypes.set(r.items));
      this.api.getAccounts('investment').subscribe((r) => this.investmentFinancialAccounts.set(r.items));
    }
    this.load();
  }

  load(refresher?: HTMLIonRefresherElement): void {
    this.loading.set(true);
    this.api.getRecurringItems(this.meta.kind, this.isInstallmentMode()).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.loading.set(false);
        refresher?.complete();
      },
      error: () => {
        this.loading.set(false);
        refresher?.complete();
      },
    });
  }

  onRefresh(ev: CustomEvent): void {
    this.load(ev.target as unknown as HTMLIonRefresherElement);
  }

  setUserTab(key: UserTabKey): void {
    this.activeUserTab.set(key);
  }

  itemAccountLabel(i: RecurringItem): string | null {
    if (this.isInvestment()) {
      const src = i.sourceFinancialAccountName;
      const dest = i.financialAccountName;
      if (src && dest) return `${src} → ${dest}`;
      if (dest) return `Entrada: ${dest}`;
      if (src) return `Saída: ${src}`;
      return null;
    }
    const acc = i.sourceFinancialAccountName;
    if (!acc) return null;
    const prefix = this.meta.kind === 'income' ? 'Conta' : 'Pagamento';
    const suffix = this.meta.kind === 'income' ? ' (destino)' : '';
    return `${prefix}: ${acc}${suffix}`;
  }

  itemLabel(i: RecurringItem): string {
    return formatMoneyWithBrl(i.amount ?? i.defaultAmountBrl ?? 0, i.currency ?? 'BRL', i.defaultAmountBrl);
  }

  private blankForm(): ItemFormState {
    const now = new Date();
    return {
      name: '',
      dueDay: 10,
      currency: 'BRL',
      amount: 0,
      customTabId: null,
      itemCategoryId: null,
      newCategoryName: '',
      newCategoryIcon: 'package',
      responsibleUserId: null,
      sourceFinancialAccountId: null,
      financialAccountId: null,
      investmentTypeId: null,
      startMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      installmentCount: 2,
    };
  }

  openNew(): void {
    this.editingId.set(null);
    this.newCategoryMode.set(false);
    this.error.set('');
    this.form = this.blankForm();
    if (this.usesCustomTabs() && this.customTabs().length) {
      this.form.customTabId = this.customTabs()[0].id;
    }
    this.showForm.set(true);
  }

  openEdit(i: RecurringItem): void {
    if (this.editingId() === i.id) {
      this.closeForm();
      return;
    }
    this.editingId.set(i.id);
    this.newCategoryMode.set(false);
    this.error.set('');
    this.form = {
      name: i.name,
      dueDay: i.dueDay ?? 10,
      currency: i.currency ?? 'BRL',
      amount: i.amount ?? i.defaultAmountBrl ?? 0,
      customTabId: i.customTabId ?? null,
      itemCategoryId: i.itemCategoryId ?? null,
      newCategoryName: '',
      newCategoryIcon: 'package',
      responsibleUserId: i.responsibleUserId ?? null,
      sourceFinancialAccountId: i.sourceFinancialAccountId ?? null,
      financialAccountId: i.financialAccountId ?? null,
      investmentTypeId: i.investmentTypeId ?? null,
      startMonth: (i.startDate ?? '').slice(0, 7) || this.blankForm().startMonth,
      installmentCount: 2,
    };
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.newCategoryMode.set(false);
  }

  onCategorySelect(value: number | '__new__' | null): void {
    if (value === '__new__') {
      this.newCategoryMode.set(true);
      this.form.itemCategoryId = null;
      this.form.newCategoryName = '';
      this.form.newCategoryIcon = suggestCategoryIcon('');
      return;
    }
    this.newCategoryMode.set(false);
    this.form.itemCategoryId = value;
  }

  onNewCategoryNameChange(name: string): void {
    this.form.newCategoryName = name;
    if (this.newCategoryMode()) this.form.newCategoryIcon = suggestCategoryIcon(name);
  }

  formPreviewBrl(): number {
    const rate = this.form.currency === 'USD' ? this.usdToBrl() : this.eurToBrl();
    return previewBrl(this.form.amount, this.form.currency, rate);
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2200, position: 'bottom' });
    await t.present();
  }

  async save(): Promise<void> {
    this.error.set('');
    if (!this.form.name.trim()) {
      this.error.set('Informe um nome.');
      return;
    }
    if (this.isInstallmentMode()) {
      if (!this.form.startMonth || !this.endMonthFromStart()) {
        this.error.set('Informe o mês da primeira parcela.');
        return;
      }
      if (this.endMonthFromStart() < this.form.startMonth) {
        this.error.set('O mês final não pode ser antes do inicial.');
        return;
      }
    }

    const category = this.isInvestment()
      ? this.meta.categoryDefault
      : (this.itemCategories().find((c) => c.id === this.form.itemCategoryId)?.name ?? this.meta.categoryDefault);

    const payload: Partial<RecurringItem> & { newCategoryName?: string; newCategoryIcon?: string } = {
      kind: this.meta.kind,
      name: this.form.name.trim(),
      category,
      region: 'geral',
      dueDay: this.form.dueDay ?? undefined,
      currency: this.form.currency,
      amount: this.form.amount,
      customTabId: this.usesCustomTabs() ? this.form.customTabId : null,
      itemCategoryId: this.isInvestment() ? null : this.form.itemCategoryId,
      newCategoryName: this.newCategoryMode() ? this.form.newCategoryName.trim() || undefined : undefined,
      newCategoryIcon: this.newCategoryMode() ? this.form.newCategoryIcon : undefined,
      responsibleUserId: this.form.responsibleUserId,
      investmentTypeId: this.isInvestment() ? this.form.investmentTypeId : undefined,
      financialAccountId: this.isInvestment() ? this.form.financialAccountId : null,
      sourceFinancialAccountId: this.form.sourceFinancialAccountId,
      isInstallment: this.isInstallmentMode(),
      startDate: this.isInstallmentMode() ? `${this.form.startMonth}-01` : null,
      endDate: this.isInstallmentMode() ? `${this.endMonthFromStart()}-01` : null,
    };

    this.saving.set(true);
    this.api.saveRecurringItem(payload, this.editingId() ?? undefined).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.load();
      },
      error: async (err) => {
        this.saving.set(false);
        await this.toast(err.error?.error ?? 'Não foi possível salvar.');
      },
    });
  }

  clampInstallments(n: number): void {
    this.form.installmentCount = clampInstallmentCount(n);
  }

  async remove(i: RecurringItem): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Remover item',
      message: `Remover "${i.name}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => this.api.deleteRecurringItem(i.id).subscribe(() => this.load()),
        },
      ],
    });
    await alert.present();
  }
}

const DONUT_PALETTE = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#84CC16',
  '#14B8A6',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#64748B',
  '#22C55E',
];
