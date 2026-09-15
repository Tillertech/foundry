import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFileSignature,
  lucideFileText,
  lucideFolderKanban,
  lucideFolderOpen,
  lucideLayoutDashboard,
  lucideLogOut,
  lucideMessagesSquare,
  lucideMoon,
  lucideSun,
  lucideUserRound,
  lucideWallet,
} from '@ng-icons/lucide';
import { PortalAuthService } from '../domains/auth';
import { ThemeService } from '../core/theme.service';
import { ToastService } from '@foundry/shared-ui';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  exact: boolean;
  visible: () => boolean;
}

@Component({
  selector: 'app-portal-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  providers: [
    provideIcons({
      lucideFileSignature,
      lucideFileText,
      lucideFolderKanban,
      lucideFolderOpen,
      lucideLayoutDashboard,
      lucideLogOut,
      lucideMessagesSquare,
      lucideMoon,
      lucideSun,
      lucideUserRound,
      lucideWallet,
    }),
  ],
  templateUrl: './portal-shell.html',
})
export class PortalShell {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(PortalAuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly me = this.auth.me;
  protected readonly client = computed(
    () => this.me()?.clientPortal.client ?? null,
  );
  protected readonly permission = computed(
    () => this.me()?.clientPortal.permission ?? null,
  );

  protected readonly initials = computed(() => {
    const name = this.me()?.name ?? '';
    return name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });

  protected readonly userMenuOpen = signal(false);

  /** This portal's base path - every link in the shell is rooted here. */
  protected readonly base = computed(() => `/${this.auth.slug() ?? ''}`);
  protected readonly profileLink = computed(() => `${this.base()}/profile`);

  protected readonly nav = computed<NavItem[]>(() => {
    const permission = this.permission();
    const base = this.base();
    return [
      {
        to: base,
        label: 'Dashboard',
        icon: 'lucideLayoutDashboard',
        exact: true,
        visible: () => true,
      },
      {
        to: `${base}/projects`,
        label: 'Projects',
        icon: 'lucideFolderKanban',
        exact: false,
        visible: () => permission?.viewProjects ?? false,
      },
      {
        to: `${base}/documents`,
        label: 'Documents',
        icon: 'lucideFolderOpen',
        exact: false,
        visible: () => permission?.viewDocuments ?? false,
      },
      {
        to: `${base}/quotes`,
        label: 'Quotes',
        icon: 'lucideFileSignature',
        exact: false,
        visible: () => permission?.viewQuotes ?? false,
      },
      {
        to: `${base}/invoices`,
        label: 'Invoices',
        icon: 'lucideFileText',
        exact: false,
        visible: () => permission?.viewPayments ?? false,
      },
      {
        to: `${base}/payments`,
        label: 'Payments',
        icon: 'lucideWallet',
        exact: false,
        visible: () => permission?.viewPayments ?? false,
      },
      {
        to: `${base}/messages`,
        label: 'Messages',
        icon: 'lucideMessagesSquare',
        exact: false,
        visible: () => true,
      },
    ].filter((item) => item.visible());
  });

  protected readonly mobileNav = computed<NavItem[]>(() => {
    const base = this.base();
    return this.nav()
      .filter((item) =>
        [base, `${base}/projects`, `${base}/invoices`, `${base}/messages`].includes(
          item.to,
        ),
      )
      .concat([
        {
          to: this.profileLink(),
          label: 'Profile',
          icon: 'lucideUserRound',
          exact: false,
          visible: () => true,
        },
      ]);
  });

  protected toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
  }

  protected closeMenus(): void {
    this.userMenuOpen.set(false);
  }

  protected signOut(): void {
    this.closeMenus();
    const loginUrl = `${this.base()}/login`;
    this.auth.logout();
    this.toast.info('Signed out of the client portal');
    void this.router.navigateByUrl(loginUrl);
  }
}
