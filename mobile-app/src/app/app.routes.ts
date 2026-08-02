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
    loadComponent: () =>
      import('./shared/components/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    data: { title: 'Configurações' },
  },
  {
    path: 'grafo-contas',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () =>
      import('./shared/components/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    data: { title: 'Grafo de contas' },
  },
  {
    path: 'gastos-fixos',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () =>
      import('./shared/components/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    data: { title: 'Gastos fixos' },
  },
  {
    path: 'compras-parceladas',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () =>
      import('./shared/components/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    data: { title: 'Compras parceladas' },
  },
  {
    path: 'recebimentos-fixos',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () =>
      import('./shared/components/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    data: { title: 'Recebimentos fixos' },
  },
  {
    path: 'investimentos-fixos',
    canActivate: [authGuard, appLockGuard],
    loadComponent: () =>
      import('./shared/components/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    data: { title: 'Investimentos fixos' },
  },
  { path: '**', redirectTo: '' },
];
