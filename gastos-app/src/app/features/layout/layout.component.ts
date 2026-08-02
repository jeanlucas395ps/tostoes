import { Component, inject, OnInit, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { PlanningService } from '../../core/services/planning.service';
import { ThemeService } from '../../core/services/theme.service';
import { Planning } from '../../core/models/api.models';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { SafeHtmlPipe } from '../../core/pipes/safe-html.pipe';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UserAvatarComponent, FormsModule, SafeHtmlPipe],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent implements OnInit {
  private router = inject(Router);

  auth = inject(AuthService);
  planning = inject(PlanningService);
  theme = inject(ThemeService);

  pageTitle = signal('Início');

  readonly today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  showCreateModal = signal(false);
  createName = signal('Novo planejamento');
  createError = signal('');
  createLoading = signal(false);

  showEditModal = signal(false);
  editId = signal<number | null>(null);
  editName = signal('');
  editError = signal('');
  editLoading = signal(false);

  showDeleteModal = signal(false);
  deleteTarget = signal<Planning | null>(null);
  deleteError = signal('');
  deleteLoading = signal(false);

  showInviteModal = signal(false);
  inviteEmail = signal('');
  invitePlanningId = signal<number | null>(null);
  inviteError = signal('');
  inviteLoading = signal(false);
  inviteSuccess = signal('');
  showUserMenu = signal(false);

  ngOnInit(): void {
    this.syncPageTitle();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.syncPageTitle();
        this.closeUserMenu();
      });

    if (this.auth.isAuthenticated() && !this.auth.user()) {
      this.auth.loadMe().subscribe();
    } else if (this.auth.isAuthenticated() && !this.planning.items().length) {
      this.planning.load().subscribe();
    }
  }

  private syncPageTitle(): void {
    let route = this.router.routerState.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const fromData = route.snapshot.data['title'] as string | undefined;
    if (fromData) {
      this.pageTitle.set(fromData);
      return;
    }
    const match = this.navGroups
      .flatMap((g) => g.items)
      .find((item) => this.router.url.startsWith(item.path));
    this.pageTitle.set(match?.label ?? 'Tostoes');
  }

  readonly navGroups: { title: string; items: { path: string; label: string; icon: string }[] }[] = [
    {
      title: 'Visão geral',
      items: [
        {
          path: '/home',
          label: 'Início',
          // Casa, destino inicial, visão geral
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        },
        {
          path: '/movimentos',
          label: 'Movimentos',
          // Setas de troca bidirecionais, lançamentos de entrada e saída
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>',
        },
        {
          path: '/metas',
          label: 'Metas',
          // Alvo/bullseye, objetivos financeiros
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        },
        {
          path: '/contas',
          label: 'Conta e Cartão de Crédito',
          // Carteira, contas e patrimônio
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/></svg>',
        },
        {
          path: '/grafo-contas',
          label: 'Grafo de contas',
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M9 6h6M9 18h3M15 9v6"/></svg>',
        },
      ],
    },
    {
      title: 'Planejamento',
      items: [
        {
          path: '/gastos-fixos',
          label: 'Gastos fixos',
          // Calendário com traço, despesa recorrente agendada
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="16" y2="15"/></svg>',
        },
        {
          path: '/compras-parceladas',
          label: 'Compras parceladas',
          // Cartão, parcelas com início e fim
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>',
        },
        {
          path: '/recebimentos-fixos',
          label: 'Receb. fixos',
          // Calendário com +, receita recorrente agendada
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="13" x2="12" y2="19"/><line x1="9" y1="16" x2="15" y2="16"/></svg>',
        },
        {
          path: '/investimentos-fixos',
          label: 'Investimentos',
          // Gráfico crescente, portfólio de investimentos
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
        },
      ],
    },
    {
      title: 'Sistema',
      items: [
        {
          path: '/configuracoes',
          label: 'Configurações',
          // Engrenagem, ajustes do sistema
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        },
      ],
    },
  ];

  selectPlanning(id: number): void {
    if (id !== this.planning.activeId()) {
      this.planning.setActive(id);
      window.location.reload();
    }
  }

  openCreateModal(): void {
    this.createName.set('Novo planejamento');
    this.createError.set('');
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  submitCreatePlanning(): void {
    const name = this.createName().trim();
    if (!name) {
      this.createError.set('Informe um nome para o planejamento.');
      return;
    }
    this.createLoading.set(true);
    this.planning.create(name).subscribe({
      next: () => {
        this.createLoading.set(false);
        this.closeCreateModal();
        window.location.reload();
      },
      error: (err) => {
        this.createLoading.set(false);
        this.createError.set(err.error?.error ?? 'Não foi possível criar o planejamento.');
      },
    });
  }

  openEditModal(p: Planning, event: Event): void {
    event.stopPropagation();
    if (p.role !== 'owner') return;
    this.editId.set(p.id);
    this.editName.set(p.name);
    this.editError.set('');
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.editId.set(null);
  }

  submitEditPlanning(): void {
    const id = this.editId();
    const name = this.editName().trim();
    if (!id) return;
    if (!name) {
      this.editError.set('Informe um nome para o planejamento.');
      return;
    }
    this.editLoading.set(true);
    this.planning.update(id, name).subscribe({
      next: () => {
        this.editLoading.set(false);
        this.closeEditModal();
      },
      error: (err) => {
        this.editLoading.set(false);
        this.editError.set(err.error?.error ?? 'Não foi possível renomear o planejamento.');
      },
    });
  }

  openDeleteModal(p: Planning, event: Event): void {
    event.stopPropagation();
    if (p.role !== 'owner') return;
    this.deleteTarget.set(p);
    this.deleteError.set('');
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deleteTarget.set(null);
  }

  submitDeletePlanning(): void {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleteLoading.set(true);
    this.deleteError.set('');
    const wasActive = target.id === this.planning.activeId();
    this.planning.delete(target.id).subscribe({
      next: (items) => {
        this.deleteLoading.set(false);
        this.closeDeleteModal();
        if (!items.length) {
          this.openCreateModal();
          return;
        }
        if (wasActive) {
          window.location.reload();
        }
      },
      error: (err) => {
        this.deleteLoading.set(false);
        this.deleteError.set(err.error?.error ?? 'Não foi possível apagar o planejamento.');
      },
    });
  }

  openInviteModal(): void {
    this.inviteEmail.set('');
    this.invitePlanningId.set(this.planning.activeId());
    this.inviteError.set('');
    this.inviteSuccess.set('');
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    this.showInviteModal.set(false);
  }

  sendInvite(): void {
    const id = this.invitePlanningId();
    const email = this.inviteEmail().trim();
    if (!id) {
      this.inviteError.set('Selecione o planejamento.');
      return;
    }
    if (!email) {
      this.inviteError.set('Informe o e-mail da pessoa.');
      return;
    }
    this.inviteLoading.set(true);
    this.inviteError.set('');
    this.planning.sendInvite(id, email).subscribe({
      next: (res) => {
        this.inviteLoading.set(false);
        let msg = res.message;
        if (res.inviteUrl) {
          msg += ` Link (dev): ${res.inviteUrl}`;
        }
        this.inviteSuccess.set(msg);
      },
      error: (err) => {
        this.inviteLoading.set(false);
        this.inviteError.set(err.error?.error ?? 'Não foi possível enviar o convite.');
      },
    });
  }

  openUserMenu(): void {
    this.showUserMenu.set(true);
  }

  closeUserMenu(): void {
    this.showUserMenu.set(false);
  }

  goToProfile(): void {
    this.closeUserMenu();
    this.router.navigate(['/perfil']);
  }

  logoutFromMenu(): void {
    this.closeUserMenu();
    this.auth.logout();
  }

  logout(): void {
    this.auth.logout();
  }
}
