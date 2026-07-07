import { Route } from '@angular/router';
import { authGuard, guestGuard } from './domains/auth';
import { AppShell } from './layout/app-shell';

export const appRoutes: Route[] = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        title: 'Sign in - Foundry',
        loadComponent: () => import('./pages/auth/login').then((m) => m.Login),
      },
      {
        path: 'signup',
        title: 'Create account - Foundry',
        loadComponent: () => import('./pages/auth/signup').then((m) => m.Signup),
      },
      {
        path: 'reset',
        title: 'Reset password - Foundry',
        loadComponent: () => import('./pages/auth/reset-password').then((m) => m.ResetPassword),
      },
      {
        path: 'verify',
        title: 'Confirm your email - Foundry',
        loadComponent: () => import('./pages/auth/verify-email').then((m) => m.VerifyEmail),
      },
      {
        path: 'verify-login',
        title: 'Enter your sign-in code - Foundry',
        loadComponent: () => import('./pages/auth/verify-login').then((m) => m.VerifyLogin),
      },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
    ],
  },
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Dashboard - Foundry',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'clients',
        title: 'Clients - Foundry',
        loadComponent: () => import('./pages/clients/clients').then((m) => m.Clients),
      },
      {
        path: 'projects',
        title: 'Projects - Foundry',
        loadComponent: () => import('./pages/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'invoices',
        title: 'Invoices - Foundry',
        loadComponent: () => import('./pages/invoices/invoices').then((m) => m.Invoices),
      },
      {
        path: 'quotes',
        title: 'Quotes - Foundry',
        loadComponent: () => import('./pages/quotes/quotes').then((m) => m.Quotes),
      },
      {
        path: 'payments',
        title: 'Payments - Foundry',
        loadComponent: () => import('./pages/payments/payments').then((m) => m.Payments),
      },
      {
        path: 'expenses',
        title: 'Expenses - Foundry',
        loadComponent: () => import('./pages/expenses/expenses').then((m) => m.Expenses),
      },
      {
        path: 'documents',
        title: 'Documents - Foundry',
        loadComponent: () => import('./pages/documents/documents').then((m) => m.Documents),
      },
      {
        path: 'reports',
        title: 'Reports - Foundry',
        loadComponent: () => import('./pages/reports/reports').then((m) => m.Reports),
      },
      {
        path: 'settings',
        title: 'Settings - Foundry',
        loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
