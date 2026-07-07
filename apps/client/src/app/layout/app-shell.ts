import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBell,
  lucideChartColumn,
  lucideFileSignature,
  lucideFileText,
  lucideFolderKanban,
  lucideFolderOpen,
  lucideLayoutDashboard,
  lucideLogOut,
  lucideMoon,
  lucidePanelLeftClose,
  lucidePanelLeftOpen,
  lucidePlus,
  lucideReceipt,
  lucideSearch,
  lucideSettings,
  lucideSun,
  lucideUsers,
  lucideWallet,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { AuthService } from '../domains/auth';
import { ApiClient, ClientsApiService } from '../domains/clients';
import { ThemeService } from '../core/theme.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NgIcon, HlmButton],
  providers: [
    provideIcons({
      lucideBell,
      lucideChartColumn,
      lucideFileSignature,
      lucideFileText,
      lucideFolderKanban,
      lucideFolderOpen,
      lucideLayoutDashboard,
      lucideLogOut,
      lucideMoon,
      lucidePanelLeftClose,
      lucidePanelLeftOpen,
      lucidePlus,
      lucideReceipt,
      lucideSearch,
      lucideSettings,
      lucideSun,
      lucideUsers,
      lucideWallet,
    }),
  ],
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly clientsApi = inject(ClientsApiService);

  protected readonly collapsed = signal(false);
  private readonly clients = signal<ApiClient[]>([]);

  constructor() {
    this.auth.refresh();
    this.clientsApi.list({ take: 3 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });
  }

  protected readonly recentClients = computed(() =>
    this.clients().map((c) => ({
      id: c.id,
      name: c.company || c.name,
      initials: (c.company || c.name)
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join(''),
    })),
  );

  protected readonly nav: NavItem[] = [
    {
      path: '/',
      label: 'Dashboard',
      icon: 'lucideLayoutDashboard',
      exact: true,
    },
    { path: '/clients', label: 'Clients', icon: 'lucideUsers' },
    { path: '/projects', label: 'Projects', icon: 'lucideFolderKanban' },
    { path: '/invoices', label: 'Invoices', icon: 'lucideFileText' },
    { path: '/quotes', label: 'Quotes', icon: 'lucideFileSignature' },
    { path: '/payments', label: 'Payments', icon: 'lucideWallet' },
    { path: '/expenses', label: 'Expenses', icon: 'lucideReceipt' },
    { path: '/documents', label: 'Documents', icon: 'lucideFolderOpen' },
    { path: '/reports', label: 'Reports', icon: 'lucideChartColumn' },
    { path: '/settings', label: 'Settings', icon: 'lucideSettings' },
  ];

  protected toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }
}
