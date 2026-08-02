import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    redirectTo: 'cadastro',
    pathMatch: 'full',
  },
  {
    path: 'cadastro',
    loadComponent: () =>
      import('./features/register/register.component').then((m) => m.RegisterComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'recuperar-senha',
    loadComponent: () =>
      import('./features/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent
      ),
    canActivate: [guestGuard],
  },
  {
    path: 'redefinir-senha',
    loadComponent: () =>
      import('./features/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent
      ),
    canActivate: [guestGuard],
  },
  {
    path: 'convite/:token',
    loadComponent: () =>
      import('./features/invite-accept/invite-accept.component').then(
        (m) => m.InviteAcceptComponent
      ),
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/layout/layout.component').then((m) => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
        data: { title: 'Início' },
      },
      {
        path: 'movimentos',
        loadComponent: () =>
          import('./features/movements/movements.component').then(
            (m) => m.MovementsComponent
          ),
        data: { title: 'Movimentos' },
      },
      {
        path: 'metas',
        loadComponent: () =>
          import('./features/goals/goals.component').then((m) => m.GoalsComponent),
        data: { title: 'Metas' },
      },
      {
        path: 'contas',
        loadComponent: () =>
          import('./features/accounts/accounts.component').then(
            (m) => m.AccountsComponent
          ),
        data: { title: 'Conta e Cartão de Crédito' },
      },
      {
        path: 'grafo-contas',
        loadComponent: () =>
          import('./features/account-graph/account-graph.component').then(
            (m) => m.AccountGraphComponent
          ),
        data: { title: 'Grafo de contas' },
      },
      {
        path: 'gastos-fixos',
        loadComponent: () =>
          import('./features/fixed-items/fixed-items.component').then(
            (m) => m.FixedItemsComponent
          ),
        data: {
          kind: 'expense',
          title: 'Gastos fixos',
          subtitle: 'Despesas recorrentes, confirme o pagamento em Movimentos',
          accent: '#f85149',
          categoryDefault: 'Brasil',
          userOverviewTabs: true,
        },
      },
      {
        path: 'compras-parceladas',
        loadComponent: () =>
          import('./features/fixed-items/fixed-items.component').then(
            (m) => m.FixedItemsComponent
          ),
        data: {
          kind: 'expense',
          title: 'Compras parceladas',
          subtitle:
            'Parcelas de cartão ou compras a prazo, entram em Movimentos até o mês da última parcela',
          accent: '#f59e0b',
          categoryDefault: 'Geral',
          userOverviewTabs: true,
          installmentMode: true,
        },
      },
      {
        path: 'recebimentos-fixos',
        loadComponent: () =>
          import('./features/fixed-items/fixed-items.component').then(
            (m) => m.FixedItemsComponent
          ),
        data: {
          kind: 'income',
          title: 'Recebimentos fixos',
          subtitle: 'Entradas recorrentes, confirme o recebimento em Movimentos',
          accent: '#3fb950',
          categoryDefault: 'Salário',
          userOverviewTabs: true,
        },
      },
      {
        path: 'investimentos-fixos',
        loadComponent: () =>
          import('./features/fixed-items/fixed-items.component').then(
            (m) => m.FixedItemsComponent
          ),
        data: {
          kind: 'investment',
          title: 'Investimentos fixos',
          subtitle: 'Aportes recorrentes, confirme em Movimentos (banco → investimento)',
          accent: '#a371f7',
          categoryDefault: 'Investimento',
          userOverviewTabs: true,
        },
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
        data: { title: 'Meu perfil' },
      },
      {
        path: 'configuracoes',
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
        data: { title: 'Configurações' },
      },
    ],
  },
  { path: '**', redirectTo: '/home' },
];
