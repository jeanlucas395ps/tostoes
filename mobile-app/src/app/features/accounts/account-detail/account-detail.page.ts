import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
import { FinanceApiService } from '../../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../../core/pipes/currency-brl.pipe';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { AccountFormComponent } from '../account-form/account-form.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { EntryKind, FinancialAccount } from '../../../core/models/api.models';
import { accountTypeShortLabel } from '../../../core/utils/account-labels.util';

const KIND_LABELS_DEFAULT: Record<'' | EntryKind, string> = {
  '': 'Todos',
  income: 'Entradas',
  expense: 'Saídas',
  investment: 'Aportes',
  leisure: 'Lazer',
  transfer: 'Transferências',
};

const KIND_LABELS_CREDIT: Record<'' | EntryKind, string> = {
  ...KIND_LABELS_DEFAULT,
  income: 'Pagamentos',
  expense: 'Compras',
};

@Component({
  selector: 'app-account-detail',
  standalone: true,
  imports: [
    FormsModule,
    SlicePipe,
    CurrencyBrlPipe,
    MonthNavComponent,
    AccountFormComponent,
    SkeletonComponent,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
  ],
  templateUrl: './account-detail.page.html',
  styleUrl: './account-detail.page.scss',
})
export class AccountDetailPage implements OnInit {
  private api = inject(FinanceApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);

  accountId = Number(this.route.snapshot.paramMap.get('id'));
  account = signal<FinancialAccount | null>(null);
  loading = signal(true);
  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth());
  kindFilter = signal<'' | EntryKind>('');
  search = signal('');
  showForm = signal(false);

  accountTypeShort = accountTypeShortLabel;

  kindOptions = computed(() => {
    const labels = this.account()?.type === 'credit' ? KIND_LABELS_CREDIT : KIND_LABELS_DEFAULT;
    return (Object.keys(labels) as Array<'' | EntryKind>).map((value) => ({ value, label: labels[value] }));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .getAccount(this.accountId, this.year(), this.month() + 1, {
        kind: this.kindFilter() || undefined,
        search: this.search().trim() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.account.set(r.item);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onYearChange(y: number): void {
    this.year.set(y);
    this.load();
  }

  onMonthChange(m: number): void {
    this.month.set(m);
    this.load();
  }

  hasActiveFilters(): boolean {
    return !!this.kindFilter() || !!this.search().trim();
  }

  clearFilters(): void {
    this.kindFilter.set('');
    this.search.set('');
    this.load();
  }

  onSaved(): void {
    this.showForm.set(false);
    this.load();
  }

  async remove(): Promise<void> {
    const a = this.account();
    if (!a) return;
    const label = a.type === 'credit' ? 'cartão' : 'conta';
    const alert = await this.alertCtrl.create({
      header: 'Remover conta',
      message: `Remover ${label} "${a.name}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => {
            this.api.deleteAccount(a.id).subscribe(() => this.router.navigateByUrl('/contas'));
          },
        },
      ],
    });
    await alert.present();
  }
}
