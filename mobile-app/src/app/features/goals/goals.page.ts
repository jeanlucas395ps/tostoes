import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  AlertController,
} from '@ionic/angular/standalone';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CurrencyBrlPipe } from '../../core/pipes/currency-brl.pipe';
import { FinancialGoal } from '../../core/models/api.models';

@Component({
  selector: 'app-goals',
  standalone: true,
  imports: [
    CurrencyBrlPipe,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
  ],
  templateUrl: './goals.page.html',
  styleUrl: './goals.page.scss',
})
export class GoalsPage implements OnInit {
  private api = inject(FinanceApiService);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);

  goals = signal<FinancialGoal[]>([]);
  loading = signal(true);
  year = new Date().getFullYear();

  ngOnInit(): void {
    this.load();
  }

  load(refresher?: HTMLIonRefresherElement): void {
    this.loading.set(true);
    this.api.getGoals(this.year).subscribe({
      next: (r) => {
        this.goals.set(r.items);
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

  openNew(): void {
    this.router.navigateByUrl('/metas/novo');
  }

  openEdit(g: FinancialGoal): void {
    this.router.navigate(['/metas', g.id, 'editar'], { state: { goal: g } });
  }

  async remove(g: FinancialGoal): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Remover meta',
      message: `Remover a meta "${g.name}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => this.api.deleteGoal(g.id).subscribe(() => this.load()),
        },
      ],
    });
    await alert.present();
  }
}
