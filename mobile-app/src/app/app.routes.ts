import { Routes } from '@angular/router';
import { guestGuard, authGuard, appLockGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
    canActivate: [guestGuard],
  },
  {
    path: 'cadastro',
    loadComponent: () => import('./features/register/register.page').then((m) => m.RegisterPage),
    canActivate: [guestGuard],
  },
  {
    path: 'recuperar-senha',
    loadComponent: () =>
      import('./features/forgot-password/forgot-password.page').then((m) => m.ForgotPasswordPage),
    canActivate: [guestGuard],
  },
  {
    path: 'redefinir-senha',
    loadComponent: () =>
      import('./features/reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
    canActivate: [guestGuard],
  },
  {
    path: 'convite/:token',
    loadComponent: () =>
      import('./features/invite-accept/invite-accept.page').then((m) => m.InviteAcceptPage),
  },
  {
    path: 'desbloquear',
    loadComponent: () => import('./features/unlock/unlock.page').then((m) => m.UnlockPage),
  },
  {
    path: '',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'movimentos',
        loadComponent: () => import('./features/movements/movements.page').then((m) => m.MovementsPage),
      },
      {
        path: 'contas',
        loadComponent: () => import('./features/accounts/accounts.page').then((m) => m.AccountsPage),
      },
      {
        path: 'metas',
        loadComponent: () => import('./features/goals/goals.page').then((m) => m.GoalsPage),
      },
      {
        path: 'mais',
        loadComponent: () => import('./features/more/more.page').then((m) => m.MorePage),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  {
    path: 'metas/novo',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/goals/goal-form-page/goal-form.page').then((m) => m.GoalFormPage),
  },
  {
    path: 'metas/:id/editar',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/goals/goal-form-page/goal-form.page').then((m) => m.GoalFormPage),
  },
  {
    path: 'contas/:id',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () =>
      import('./features/accounts/account-detail/account-detail.page').then((m) => m.AccountDetailPage),
  },
  {
    path: 'perfil',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'configuracoes',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'grafo-contas',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/account-graph/account-graph.page').then((m) => m.AccountGraphPage),
  },
  {
    path: 'relatorios-ia',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/ai-reports/ai-reports.page').then((m) => m.AiReportsPage),
  },
  {
    path: 'gastos-fixos',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/fixed-items/fixed-items.page').then((m) => m.FixedItemsPage),
    data: {
      kind: 'expense',
      title: 'Gastos fixos',
      subtitle: 'Despesas recorrentes,  confirme o pagamento em Movimentos',
      accent: 'var(--danger)',
      categoryDefault: 'Brasil',
      userOverviewTabs: true,
    },
  },
  {
    path: 'compras-parceladas',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/fixed-items/fixed-items.page').then((m) => m.FixedItemsPage),
    data: {
      kind: 'expense',
      title: 'Compras parceladas',
      subtitle: 'Parcelas de cartão ou compras a prazo,  entram em Movimentos até o mês da última parcela',
      accent: 'var(--warning-dark)',
      categoryDefault: 'Geral',
      userOverviewTabs: true,
      installmentMode: true,
    },
  },
  {
    path: 'recebimentos-fixos',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/fixed-items/fixed-items.page').then((m) => m.FixedItemsPage),
    data: {
      kind: 'income',
      title: 'Recebimentos fixos',
      subtitle: 'Entradas recorrentes,  confirme o recebimento em Movimentos',
      accent: 'var(--income)',
      categoryDefault: 'Salário',
      userOverviewTabs: true,
    },
  },
  {
    path: 'investimentos-fixos',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () => import('./features/fixed-items/fixed-items.page').then((m) => m.FixedItemsPage),
    data: {
      kind: 'investment',
      title: 'Investimentos fixos',
      subtitle: 'Aportes recorrentes,  confirme em Movimentos (banco → investimento)',
      accent: 'var(--accent-invest)',
      categoryDefault: 'Investimento',
      userOverviewTabs: true,
    },
  },
  { path: '**', redirectTo: '' },
];
