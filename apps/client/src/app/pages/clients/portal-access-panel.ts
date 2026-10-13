import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderKanban,
  lucideMailCheck,
  lucidePause,
  lucidePlay,
  lucideSearch,
  lucideShieldAlert,
  lucideShieldCheck,
  lucideSlidersHorizontal,
  lucideUserPlus,
  lucideUsers,
} from '@ng-icons/lucide';
import { BrnAlertDialogContent } from '@spartan-ng/brain/alert-dialog';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { ToastService } from '@foundry/shared-ui';
import { apiErrorMessage } from '@foundry/shared-util';
import { Observable } from 'rxjs';
import {
  ClientPortal,
  ClientPortalApiService,
  PortalPermissionFlags,
} from '../../domains/client-portals';
import { PortalUser, PortalUsersApiService } from '../../domains/portal-users';
import {
  PortalUserDialog,
  PortalUserDialogContext,
} from './portal-user-dialog';

type PermissionKey = keyof PortalPermissionFlags;

const permissionMeta: { key: PermissionKey; label: string; desc: string }[] = [
  {
    key: 'viewProjects',
    label: 'Projects',
    desc: 'Shared projects with status, budget and milestones.',
  },
  {
    key: 'viewDocuments',
    label: 'Documents',
    desc: 'View and download shared documents.',
  },
  {
    key: 'viewQuotes',
    label: 'Quotes',
    desc: 'Quotes and proposals sent to the client.',
  },
  {
    key: 'viewPayments',
    label: 'Invoices & payments',
    desc: 'Invoices with PDF download, and payments received.',
  },
];

/**
 * The "Portal access" tab of a client's sheet: turn the client's portal on,
 * decide what it shows (workspace defaults or its own permissions), choose
 * which projects are shared into it, and manage the people who can sign in.
 *
 * Every write answers with the whole portal, which replaces `portal` here -
 * users and project shares are views onto that one signal.
 */
@Component({
  selector: 'app-portal-access-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [
    NgIcon,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSwitchImports,
    HlmAlertDialogImports,
    BrnAlertDialogContent,
  ],
  providers: [
    provideIcons({
      lucideFolderKanban,
      lucideMailCheck,
      lucidePause,
      lucidePlay,
      lucideSearch,
      lucideShieldAlert,
      lucideShieldCheck,
      lucideSlidersHorizontal,
      lucideUserPlus,
      lucideUsers,
    }),
  ],
  templateUrl: './portal-access-panel.html',
})
export class PortalAccessPanel {
  private readonly portalApi = inject(ClientPortalApiService);
  private readonly portalUsersApi = inject(PortalUsersApiService);
  private readonly dialogService = inject(HlmDialogService);
  private readonly toast = inject(ToastService);

  readonly clientId = input.required<string>();
  readonly clientName = input.required<string>();

  protected readonly permissionMeta = permissionMeta;

  /** null until the client has a portal provisioned. */
  protected readonly portal = signal<ClientPortal | null>(null);
  protected readonly loading = signal(true);
  /** Any portal-level write in flight (toggle, permissions, project share). */
  protected readonly saving = signal(false);
  /** Id of the user a row action is running for. */
  protected readonly busyUserId = signal<string | null>(null);

  protected readonly projectQuery = signal('');
  protected readonly userQuery = signal('');

  protected readonly portalActive = computed(
    () => this.portal()?.active ?? false,
  );
  protected readonly projects = computed(
    () => this.portal()?.clientPortalProjects ?? [],
  );
  protected readonly users = computed(
    () => this.portal()?.clientPortalUsers ?? [],
  );
  protected readonly sharedProjectCount = computed(
    () => this.projects().filter((p) => p.active).length,
  );
  protected readonly inherits = computed(
    () => this.portal()?.permission?.inherit ?? true,
  );
  protected readonly permissions = computed<PortalPermissionFlags>(
    () =>
      this.portal()?.effectivePermission ?? {
        viewProjects: false,
        viewDocuments: false,
        viewQuotes: false,
        viewPayments: false,
      },
  );
  protected readonly filteredProjects = computed(() => {
    const term = this.projectQuery().trim().toLowerCase();
    const list = this.projects();
    if (!term) return list;
    return list.filter((p) => p.project.name.toLowerCase().includes(term));
  });

  protected readonly filteredUsers = computed(() => {
    const term = this.userQuery().trim().toLowerCase();
    const list = this.users();
    if (!term) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term),
    );
  });

  constructor() {
    effect(() => {
      const clientId = this.clientId();
      untracked(() => this.load(clientId));
    });
  }

  /** Guards against a slow response for a client the sheet has moved on from. */
  private loadToken = 0;

  private load(clientId: string, quiet = false): void {
    const token = ++this.loadToken;
    if (!quiet) {
      this.portal.set(null);
      this.loading.set(true);
      this.projectQuery.set('');
      this.userQuery.set('');
    }
    if (!clientId) {
      this.loading.set(false);
      return;
    }
    this.portalApi.list({ take: 1, clientId }).subscribe({
      next: (res) => {
        if (token !== this.loadToken) return;
        this.portal.set(res.results[0] ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        if (token !== this.loadToken) return;
        this.loading.set(false);
        this.toast.error('Could not load portal access', apiErrorMessage(err));
      },
    });
  }

  /** Runs a portal-level write and swaps in the portal it answers with. */
  private savePortal(
    request: Observable<ClientPortal>,
    failure: string,
    success?: string,
  ): void {
    if (this.saving()) return;
    this.saving.set(true);
    request.subscribe({
      next: (portal) => {
        this.saving.set(false);
        this.portal.set(portal);
        if (success) this.toast.success(success);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(failure, apiErrorMessage(err));
      },
    });
  }

  protected togglePortalActive(active: boolean): void {
    const portal = this.portal();
    if (!portal) {
      // First switch-on provisions the portal: it inherits the workspace
      // defaults, shares the client's projects and invites their email.
      this.savePortal(
        this.portalApi.create({ clientId: this.clientId() }),
        'Could not create the client portal',
        'Portal created - the client has been invited',
      );
      return;
    }
    this.savePortal(
      this.portalApi.update(portal.id, { active }),
      'Could not update the client portal',
      active ? 'Portal access turned on' : 'Portal access turned off',
    );
  }

  /** Back to the workspace defaults, or onto the portal's own flags (seeded from what it shows now). */
  protected setInherit(inherit: boolean): void {
    const portal = this.portal();
    if (!portal || inherit === this.inherits()) return;
    this.savePortal(
      this.portalApi.update(
        portal.id,
        inherit
          ? { inheritPermissions: true }
          : { inheritPermissions: false, ...this.permissions() },
      ),
      'Could not update permissions',
      inherit
        ? 'Now following workspace defaults'
        : 'This portal now has its own permissions',
    );
  }

  protected setPermission(key: PermissionKey, value: boolean): void {
    const portal = this.portal();
    if (!portal || this.inherits()) return;
    this.savePortal(
      this.portalApi.update(portal.id, {
        inheritPermissions: false,
        [key]: value,
      }),
      'Could not update permissions',
    );
  }

  protected toggleProjectShared(projectId: string, active: boolean): void {
    const portal = this.portal();
    if (!portal) return;
    this.savePortal(
      this.portalApi.shareProject(portal.id, projectId, active),
      'Could not update project sharing',
    );
  }

  protected openInvite(): void {
    this.openUserDialog();
  }

  protected manageUser(user: PortalUser): void {
    this.openUserDialog(user);
  }

  private openUserDialog(user?: PortalUser): void {
    const portal = this.portal();
    if (!portal) return;
    const context: PortalUserDialogContext = {
      clientPortalId: portal.id,
      clientName: this.clientName(),
      projects: this.projects().map((p) => ({
        id: p.project.id,
        name: p.project.name,
        shared: p.active,
      })),
      permissionSummary: permissionMeta
        .filter((m) => this.permissions()[m.key])
        .map((m) => m.label)
        .join(', '),
      inheritsPermissions: this.inherits(),
      user,
    };
    const ref = this.dialogService.open(PortalUserDialog, {
      contentClass: 'sm:max-w-lg',
      context,
    });
    ref.closed$.subscribe((result) => {
      const saved = result as PortalUser | undefined;
      if (saved && user) this.toast.success(`${saved.name}'s access updated`);
      // Reload either way: an invite that was sent and then dismissed by
      // clicking away closes without a result but still added a user.
      this.load(this.clientId(), true);
    });
  }

  /** Runs a per-user action, then refreshes the portal's user list. */
  private runUserAction(
    user: PortalUser,
    request: Observable<PortalUser>,
    success: string,
    failure: string,
  ): void {
    if (this.busyUserId()) return;
    this.busyUserId.set(user.id);
    request.subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.toast.success(success);
        this.load(this.clientId(), true);
      },
      error: (err) => {
        this.busyUserId.set(null);
        this.toast.error(failure, apiErrorMessage(err));
      },
    });
  }

  protected resendInvite(user: PortalUser): void {
    this.runUserAction(
      user,
      this.portalUsersApi.resendInvite(user.id),
      `Invitation re-sent to ${user.email}`,
      'Could not resend the invitation',
    );
  }

  protected setSuspended(user: PortalUser, suspended: boolean): void {
    this.runUserAction(
      user,
      this.portalUsersApi.update(user.id, {
        status: suspended ? 'suspended' : 'active',
      }),
      suspended
        ? `${user.name} can no longer sign in`
        : `${user.name}'s access restored`,
      suspended ? 'Could not suspend the user' : 'Could not restore access',
    );
  }

  protected revoke(user: PortalUser): void {
    this.runUserAction(
      user,
      this.portalUsersApi.delete(user.id),
      `${user.name}'s portal access revoked`,
      'Could not revoke access',
    );
  }

  /** "All shared projects", or how many of the user's picked projects are actually visible. */
  protected accessLabel(user: PortalUser): string {
    if (user.allProjects) return 'All shared projects';
    const shared = new Set(
      this.projects()
        .filter((p) => p.active)
        .map((p) => p.project.id),
    );
    const visible = user.projectIds.filter((id) => shared.has(id)).length;
    const total = user.projectIds.length;
    const noun = total === 1 ? 'project' : 'projects';
    return visible === total
      ? `${total} ${noun}`
      : `${visible} of ${total} ${noun} visible`;
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
}
