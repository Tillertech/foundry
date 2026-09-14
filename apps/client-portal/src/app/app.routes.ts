import { Route } from '@angular/router';
import { authGuard, guestGuard } from './domains/auth';
import { PortalShell } from './layout/portal-shell';

export const appRoutes: Route[] = [
  {
    path: 'login',
    title: 'Sign in - Client Portal',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login').then((m) => m.Login),
  },
  {
    path: 'accept-invite',
    title: 'Accept invite - Client Portal',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/accept-invite').then((m) => m.AcceptInvite),
  },
  {
    // No guestGuard here: an already-authenticated user can reach this from
    // their Profile page to trigger a reset link without logging out first,
    // and reset-password itself never auto-logs the requester in either way.
    path: 'forgot-password',
    title: 'Forgot password - Client Portal',
    loadComponent: () =>
      import('./pages/auth/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    title: 'Reset password - Client Portal',
    loadComponent: () =>
      import('./pages/auth/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: '',
    component: PortalShell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Dashboard - Client Portal',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'projects',
        pathMatch: 'full',
        title: 'Projects - Client Portal',
        loadComponent: () =>
          import('./pages/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'projects/:id',
        title: 'Project - Client Portal',
        loadComponent: () =>
          import('./pages/projects/project-detail').then(
            (m) => m.ProjectDetail,
          ),
      },
      {
        path: 'invoices',
        title: 'Invoices - Client Portal',
        loadComponent: () =>
          import('./pages/invoices/invoices').then((m) => m.Invoices),
      },
      {
        path: 'quotes',
        title: 'Quotes - Client Portal',
        loadComponent: () =>
          import('./pages/quotes/quotes').then((m) => m.Quotes),
      },
      {
        path: 'payments',
        title: 'Payments - Client Portal',
        loadComponent: () =>
          import('./pages/payments/payments').then((m) => m.Payments),
      },
      {
        path: 'documents',
        title: 'Documents - Client Portal',
        loadComponent: () =>
          import('./pages/documents/documents').then((m) => m.Documents),
      },
      {
        path: 'messages',
        title: 'Messages - Client Portal',
        loadComponent: () =>
          import('./pages/messages/messages').then((m) => m.Messages),
      },
      {
        path: 'profile',
        title: 'Profile - Client Portal',
        loadComponent: () =>
          import('./pages/profile/profile').then((m) => m.Profile),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
