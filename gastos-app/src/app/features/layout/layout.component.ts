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
import { ICON_PATHS, navIcon } from '../../core/utils/flow-icons';

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
  /** Páginas como o grafo ocupam 100% da área útil (sem padding do main). */
  contentBleed = signal(false);

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
    const data = route.snapshot.data;
    this.contentBleed.set(!!data['contentBleed']);
    const fromData = data['title'] as string | undefined;
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
        { path: '/home', label: 'Início', icon: navIcon(ICON_PATHS.home) },
        { path: '/movimentos', label: 'Movimentos', icon: navIcon(ICON_PATHS.transfer) },
        { path: '/metas', label: 'Metas', icon: navIcon(ICON_PATHS.target) },
        { path: '/contas', label: 'Conta e Cartão de Crédito', icon: navIcon(ICON_PATHS.wallet) },
        { path: '/visualizacao-360', label: 'Visualização 360', icon: navIcon(ICON_PATHS.network) },
        { path: '/relatorios-ia', label: 'Relatórios com AI', icon: navIcon(ICON_PATHS.spark) },
      ],
    },
    {
      title: 'Planejamento',
      items: [
        { path: '/gastos-fixos', label: 'Gastos fixos', icon: navIcon(ICON_PATHS.calendar) },
        { path: '/compras-parceladas', label: 'Compras parceladas', icon: navIcon(ICON_PATHS.cardChip) },
        { path: '/recebimentos-fixos', label: 'Receb. fixos', icon: navIcon(ICON_PATHS.calendarPlus) },
        { path: '/investimentos-fixos', label: 'Investimentos', icon: navIcon(ICON_PATHS.trend) },
      ],
    },
    {
      title: 'Sistema',
      items: [
        { path: '/configuracoes', label: 'Configurações', icon: navIcon(ICON_PATHS.settings) },
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
