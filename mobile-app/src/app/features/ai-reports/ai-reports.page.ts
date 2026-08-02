import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  AlertController,
} from '@ionic/angular/standalone';
import { Subscription, TimeoutError } from 'rxjs';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import {
  AiReport,
  AiReportListItem,
  MONTH_LABELS,
  MonthSummary,
} from '../../core/models/api.models';

@Component({
  selector: 'app-ai-reports',
  standalone: true,
  imports: [
    CurrencyBrlPipe,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
  ],
  templateUrl: './ai-reports.page.html',
  styleUrl: './ai-reports.page.scss',
})
export class AiReportsPage implements OnInit, OnDestroy {
  private api = inject(FinanceApiService);
  private alertCtrl = inject(AlertController);
  private generateSub: Subscription | null = null;

  items = signal<AiReportListItem[]>([]);
  loading = signal(true);
  generating = signal(false);
  error = signal('');
  dailyLimit = signal(2);
  remainingToday = signal(2);

  showPicker = signal(false);
  showDetail = signal(false);
  detail = signal<AiReport | null>(null);
  detailLoading = signal(false);

  pickerYear = signal(new Date().getFullYear());
  monthsData = signal<MonthSummary[]>([]);
  selectedKeys = signal<string[]>([]);
  pickerLoading = signal(false);
  pickerError = signal('');

  readonly shortMonths = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];

  periodLabel = computed(() => {
    const keys = this.sortedSelectedKeys();
    if (!keys.length) return '';
    if (keys.length === 1) {
      const [y, m] = keys[0].split('-').map(Number);
      return `${MONTH_LABELS[m - 1]} de ${y}`;
    }
    const [y1, m1] = keys[0].split('-').map(Number);
    const [y2, m2] = keys[keys.length - 1].split('-').map(Number);
    return `${MONTH_LABELS[m1 - 1]}/${y1} — ${MONTH_LABELS[m2 - 1]}/${y2}`;
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.generateSub?.unsubscribe();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getAiReports().subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.dailyLimit.set(r.dailyLimit);
        this.remainingToday.set(r.remainingToday);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.error ?? 'Não foi possível carregar os relatórios.');
        this.loading.set(false);
      },
    });
  }

  openPicker(): void {
    if (this.remainingToday() <= 0) {
      this.error.set(
        `Limite diário atingido (${this.dailyLimit()} relatórios). Tente novamente amanhã.`
      );
      return;
    }
    this.selectedKeys.set([]);
    this.pickerError.set('');
    this.showPicker.set(true);
    this.loadPickerYear(this.pickerYear());
  }

  closePicker(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.abortGenerate();
    this.showPicker.set(false);
    this.pickerError.set('');
  }

  loadPickerYear(year: number): void {
    this.pickerYear.set(year);
    this.pickerLoading.set(true);
    this.api.getDashboard(year).subscribe({
      next: (d) => {
        this.monthsData.set(d.months);
        this.pickerLoading.set(false);
      },
      error: () => {
        this.pickerLoading.set(false);
        this.pickerError.set('Não foi possível carregar o calendário.');
      },
    });
  }

  shiftPickerYear(delta: number): void {
    this.loadPickerYear(this.pickerYear() + delta);
  }

  isSelected(month: number): boolean {
    return this.selectedKeys().includes(this.monthKey(this.pickerYear(), month));
  }

  toggleMonth(month: number, beforeStart?: boolean): void {
    if (beforeStart || this.generating()) return;
    const key = this.monthKey(this.pickerYear(), month);
    const current = [...this.selectedKeys()];
    const idx = current.indexOf(key);
    if (idx >= 0) {
      current.splice(idx, 1);
      this.selectedKeys.set(current);
      this.pickerError.set('');
      return;
    }
    const next = [...current, key].sort();
    if (!this.isContiguous(next)) {
      this.pickerError.set('Selecione meses consecutivos (até 3).');
      return;
    }
    if (next.length > 3) {
      this.pickerError.set('Você pode escolher no máximo 3 meses.');
      return;
    }
    this.selectedKeys.set(next);
    this.pickerError.set('');
  }

  generate(): void {
    const keys = this.sortedSelectedKeys();
    if (!keys.length) {
      this.pickerError.set('Escolha pelo menos 1 mês.');
      return;
    }
    this.abortGenerate();
    this.generating.set(true);
    this.pickerError.set('');
    this.generateSub = this.api
      .generateAiReport({
        periodStart: keys[0],
        periodEnd: keys[keys.length - 1],
      })
      .subscribe({
        next: (r) => {
          this.generating.set(false);
          this.generateSub = null;
          this.showPicker.set(false);
          this.remainingToday.set(r.remainingToday);
          this.items.update((list) => [this.toListItem(r.item), ...list]);
          this.detail.set(r.item);
          this.showDetail.set(true);
        },
        error: (err: unknown) => {
          this.generating.set(false);
          this.generateSub = null;
          this.pickerError.set(this.generateErrorMessage(err));
          if (
            err instanceof HttpErrorResponse &&
            err.status === 429 &&
            String(err.error?.error ?? '').toLowerCase().includes('limite')
          ) {
            this.remainingToday.set(0);
          }
        },
      });
  }

  openDetail(item: AiReportListItem): void {
    this.showDetail.set(true);
    this.detail.set(null);
    this.detailLoading.set(true);
    this.api.getAiReport(item.id).subscribe({
      next: (r) => {
        this.detail.set(r.item);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailLoading.set(false);
        this.showDetail.set(false);
        this.error.set('Não foi possível abrir o relatório.');
      },
    });
  }

  closeDetail(event?: Event): void {
    event?.stopPropagation();
    this.showDetail.set(false);
    this.detail.set(null);
  }

  async remove(item: AiReportListItem, event?: Event): Promise<void> {
    event?.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Remover relatório',
      message: `Remover "${item.title}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => {
            this.api.deleteAiReport(item.id).subscribe({
              next: () => {
                this.items.update((list) => list.filter((x) => x.id !== item.id));
                if (this.detail()?.id === item.id) {
                  this.closeDetail();
                }
              },
              error: () => this.error.set('Não foi possível remover o relatório.'),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  formatPeriod(item: AiReportListItem): string {
    const [ys, ms] = item.periodStart.split('-').map(Number);
    const [ye, me] = item.periodEnd.split('-').map(Number);
    if (item.periodStart === item.periodEnd) {
      return `${MONTH_LABELS[ms - 1]} de ${ys}`;
    }
    return `${MONTH_LABELS[ms - 1]}/${ys} — ${MONTH_LABELS[me - 1]}/${ye}`;
  }

  formatCreatedAt(iso: string): string {
    const d = new Date(iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  healthTone(score: number | undefined): string {
    const s = score ?? 0;
    if (s >= 8) return 'great';
    if (s >= 6) return 'good';
    if (s >= 4) return 'warn';
    return 'bad';
  }

  monthCell(month: number): MonthSummary | undefined {
    return this.monthsData().find((m) => m.month === month);
  }

  monthPreview(month: number): {
    income: number;
    expense: number;
    balance: number;
    forecast: boolean;
  } {
    const row = this.monthCell(month);
    const year = this.pickerYear();
    const now = new Date();
    const isFuture =
      year > now.getFullYear() ||
      (year === now.getFullYear() && month > now.getMonth() + 1);
    if (isFuture) {
      return {
        income: row?.projected.income ?? 0,
        expense: row?.projected.expense ?? 0,
        balance: row?.balanceProjected ?? 0,
        forecast: true,
      };
    }
    return {
      income: row?.real.income ?? 0,
      expense: row?.real.expense ?? 0,
      balance: row?.balanceReal ?? 0,
      forecast: false,
    };
  }

  private abortGenerate(): void {
    if (this.generateSub) {
      this.generateSub.unsubscribe();
      this.generateSub = null;
    }
    this.generating.set(false);
  }

  private generateErrorMessage(err: unknown): string {
    if (err instanceof TimeoutError) {
      return 'A geração demorou demais. Tente novamente em instantes.';
    }
    if (err instanceof HttpErrorResponse) {
      return err.error?.error ?? 'Falha ao gerar o relatório. Tente novamente.';
    }
    return 'Falha ao gerar o relatório. Tente novamente.';
  }

  private monthKey(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private sortedSelectedKeys(): string[] {
    return [...this.selectedKeys()].sort();
  }

  private isContiguous(keys: string[]): boolean {
    if (keys.length <= 1) return true;
    const idxs = keys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      return y * 12 + (m - 1);
    });
    for (let i = 1; i < idxs.length; i++) {
      if (idxs[i] !== idxs[i - 1] + 1) return false;
    }
    return true;
  }

  private toListItem(item: AiReport): AiReportListItem {
    return {
      id: item.id,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      monthsCount: item.monthsCount,
      title: item.title,
      status: item.status,
      summary: item.summary,
      financialHealth: item.financialHealth
        ? {
            score: item.financialHealth.score,
            label: item.financialHealth.label,
          }
        : item.content?.financialHealth
          ? {
              score: item.content.financialHealth.score,
              label: item.content.financialHealth.label,
            }
          : null,
      createdAt: item.createdAt,
    };
  }
}
