import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonIcon, AlertController } from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';
import { PlanningService } from '../../core/services/planning.service';
import { ThemeService } from '../../core/services/theme.service';
import { PlanningManagerComponent } from '../../shared/components/planning-manager/planning-manager.component';

interface Shortcut {
  label: string;
  icon: string;
  route: string;
  accent: string;
}

@Component({
  selector: 'app-more',
  standalone: true,
  imports: [RouterLink, PlanningManagerComponent, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonIcon],
  templateUrl: './more.page.html',
  styleUrl: './more.page.scss',
})
export class MorePage {
  private alertCtrl = inject(AlertController);
  auth = inject(AuthService);
  planning = inject(PlanningService);
  theme = inject(ThemeService);
  showPlanningManager = signal(false);

  readonly shortcuts: Shortcut[] = [
    { label: 'Grafo de contas', icon: 'git-network-outline', route: '/grafo-contas', accent: 'var(--primary)' },
    { label: 'Relatório com IA', icon: 'sparkles-outline', route: '/relatorios-ia', accent: 'var(--primary)' },
    { label: 'Gastos fixos', icon: 'repeat-outline', route: '/gastos-fixos', accent: 'var(--danger)' },
    { label: 'Compras parceladas', icon: 'card-outline', route: '/compras-parceladas', accent: 'var(--warning-dark)' },
    { label: 'Recebimentos fixos', icon: 'cash-outline', route: '/recebimentos-fixos', accent: 'var(--income)' },
    { label: 'Investimentos fixos', icon: 'trending-up-outline', route: '/investimentos-fixos', accent: 'var(--accent-invest)' },
    { label: 'Configurações', icon: 'settings-outline', route: '/configuracoes', accent: 'var(--text-muted)' },
  ];

  async confirmLogout(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Sair',
      message: 'Deseja sair da sua conta?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sair', role: 'destructive', handler: () => this.auth.logout() },
      ],
    });
    await alert.present();
  }
}
