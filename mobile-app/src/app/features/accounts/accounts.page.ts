import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { AccountFormComponent } from './account-form/account-form.component';
import { AccountsSummary, FinancialAccount } from '../../core/models/api.models';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [
    CurrencyBrlPipe,
    AccountFormComponent,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
  ],
  templateUrl: './accounts.page.html',
  styleUrl: './accounts.page.scss',
})
export class AccountsPage implements OnInit {
  private api = inject(FinanceApiService);
  private router = inject(Router);

  summary = signal<AccountsSummary | null>(null);
  loading = signal(true);
  showForm = signal(false);

  banks = computed(() => this.accountsOfType('bank'));
  investments = computed(() => this.accountsOfType('investment'));
  cards = computed(() => this.accountsOfType('credit'));

  private accountsOfType(type: FinancialAccount['type']): FinancialAccount[] {
    return (this.summary()?.accounts ?? []).filter((a) => a.type === type);
  }

  ngOnInit(): void {
    this.load();
  }

  load(refresher?: HTMLIonRefresherElement): void {
    this.loading.set(true);
    this.api.getAccountsSummary().subscribe({
      next: (s) => {
        this.summary.set(s);
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

  cardUsagePct(a: FinancialAccount): number {
    return Math.max(0, Math.min(100, a.limitUsagePercent ?? 0));
  }

  openAccount(a: FinancialAccount): void {
    this.router.navigateByUrl(`/contas/${a.id}`);
  }

  onCreated(): void {
    this.showForm.set(false);
    this.load();
  }
}
