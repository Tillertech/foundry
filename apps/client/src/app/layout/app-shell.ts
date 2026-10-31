import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBell,
  lucideChartColumn,
  lucideEllipsis,
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
  lucideX,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { AuthService } from '../domains/auth';
import { NotificationsMenu } from './notifications-menu';
import { ApiClient, ClientsApiService } from '../domains/clients';
import { ThemeService } from '../core/theme.service';
import { FoundrySlot, navItems, slotComponents } from '../core/extensions';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    NgIcon,
    HlmButton,
    NotificationsMenu,
    FoundrySlot,
  ],
  providers: [
    provideIcons({
      lucideBell,
      lucideChartColumn,
      lucideEllipsis,
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
      lucideX,
    }),
  ],
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly clientsApi = inject(ClientsApiService);

  protected readonly collapsed = signal(false);

  /** Extensions can replace the sidebar wordmark (see core/extensions.ts). */
  protected readonly hasSidebarHeader =
    slotComponents('shell.sidebar.header').length > 0;
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

  /** Built-in items plus any contributed with provideNavItem. */
  protected readonly nav = navItems([
    {
      path: '/',
      label: 'Dashboard',
      icon: 'lucideLayoutDashboard',
      exact: true,
      order: 10,
    },
    { path: '/clients', label: 'Clients', icon: 'lucideUsers', order: 20 },
    {
      path: '/projects',
      label: 'Projects',
      icon: 'lucideFolderKanban',
      order: 30,
    },
    {
      path: '/invoices',
      label: 'Invoices',
      icon: 'lucideFileText',
      order: 40,
    },
    {
      path: '/quotes',
      label: 'Quotes',
      icon: 'lucideFileSignature',
      order: 50,
    },
    { path: '/payments', label: 'Payments', icon: 'lucideWallet', order: 60 },
    { path: '/expenses', label: 'Expenses', icon: 'lucideReceipt', order: 70 },
    {
      path: '/documents',
      label: 'Documents',
      icon: 'lucideFolderOpen',
      order: 80,
    },
    {
      path: '/reports',
      label: 'Reports',
      icon: 'lucideChartColumn',
      order: 90,
    },
    {
      path: '/settings',
      label: 'Settings',
      icon: 'lucideSettings',
      order: 100,
    },
  ]);

  /** Bottom nav shows the first four; the rest live behind the "More" drawer. */
  // todo: add logout
  protected readonly primaryNav = this.nav.slice(0, 4);
  protected readonly moreNav = this.nav.slice(4);

  protected readonly moreOpen = signal(false);

  protected toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  protected toggleMore(): void {
    this.moreOpen.update((v) => !v);
  }

  protected closeMore(): void {
    this.moreOpen.set(false);
  }
}
