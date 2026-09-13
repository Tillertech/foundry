import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderKanban,
  lucideMailCheck,
  lucideSearch,
  lucideSettings2,
  lucideShieldAlert,
  lucideUserPlus,
  lucideUsers,
} from '@ng-icons/lucide';
import { BrnAlertDialogContent } from '@spartan-ng/brain/alert-dialog';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { toast } from '@spartan-ng/brain/sonner';
import { Project, ProjectsApiService } from '../../domains/projects';
import { InviteClientDialog } from '../settings/portal/invite-client-dialog';
import { ProjectPermissionsDialog } from '../settings/portal/project-permissions-dialog';
import { PortalSettingsStore } from '../settings/portal/portal-settings.store';
import {
  ClientPortal,
  ClientPortalApiService,
  PortalProject,
} from '../../domains/client-portals';
import { PortalUser, PortalUsersApiService } from '../../domains/portal-users';
import { apiErrorMessage } from '../../core/http/api-error';
import { ToastService } from '../../core/toast.service';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

@Component({
  selector: 'app-portal-access-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [
    NgIcon,
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
      lucideSearch,
      lucideSettings2,
      lucideShieldAlert,
      lucideUserPlus,
      lucideUsers,
    }),
  ],
  templateUrl: './portal-access-panel.html',
})
export class PortalAccessPanel {
  protected readonly store = inject(PortalSettingsStore);
  private readonly portalApi = inject(ClientPortalApiService);
  private readonly portalUsersApi = inject(PortalUsersApiService);
  private readonly dialogService = inject(HlmDialogService);

  readonly clientId = input.required<string>();
  readonly clientName = input.required<string>();

  protected readonly clientPortal = signal<ClientPortal>({} as ClientPortal);

  protected readonly projects = signal<PortalProject[]>([]);
  protected readonly loadingProjects = signal(true);

  protected readonly projectQuery = signal('');
  protected readonly userQuery = signal('');

  protected readonly portalActive = computed(() =>
    this.clientPortal && this.clientPortal().active ? true : false,
  );

  protected readonly users = signal<PortalUser[]>([]);
  protected readonly activeUsers = computed(
    () => this.users().filter((u) => u.status === 'active').length,
  );
  protected readonly invitedUsers = computed(
    () => this.users().filter((u) => u.status === 'invited').length,
  );

  protected readonly sharedProjectCount = computed(
    () =>
      this.projects().filter((p) => p.active)
        .length,
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
        u.email.toLowerCase().includes(term)
    );
  });

  constructor() {
    effect((onCleanup) => {
      const clientId = this.clientId();
      if (!clientId) {
        this.projects.set([]);
        this.loadingProjects.set(false);
        return;
      }
      this.loadingProjects.set(true);
      let cancelled = false;
      this.portalApi.list({ take: 1, clientId: clientId }).subscribe({
        next: (res) => {
          if (cancelled) return;
          const portal = res.results[0];
          if (portal) {
            this.clientPortal.set(portal);
            this.projects.set(portal.clientPortalProjects);
            this.users.set(portal.clientPortalUsers);
          }
            this.loadingProjects.set(false);
        },
        error: (err) => {
          if (cancelled) return;
          this.projects.set([]);
          this.loadingProjects.set(false);
          const description = apiErrorMessage(err);
          toast.error('Could not load clients', { description });
        },
      });

      onCleanup(() => (cancelled = true));
    });
  }

  protected togglePortalActive(active: boolean): void {
    if (this.clientPortal && this.clientPortal().id) {
      const body = { active: active };
      this.portalApi.update(this.clientPortal().id, body).subscribe({
        next: (portal) => {
          this.clientPortal.set(portal);
          toast.success(`Updated the client portal`);
        },
        error: (err) => {
          const error = apiErrorMessage(err);
          toast.error('Could not update client portal', { description: error });
        },
      });
    } else {
      this.portalApi.create({ clientId: this.clientId() }).subscribe({
        next: (res) => {
          this.clientPortal.set(res);
          toast.success(`Portal created`);
        },
        error: (err) => {
          const error = apiErrorMessage(err);
          toast.error('Could not create client portal', { description: error });
        },
      });
    }
  }

  protected toggleProjectShared(projectId: string, enabled: boolean): void {
    // todo: enable modular permission
    // this.portalApi.update(id, body)
    this.store.setProjectAccess(projectId, { enabled });
  }

  protected customizeProject(projectId: string, projectName: string): void {
    this.dialogService.open(ProjectPermissionsDialog, {
      contentClass: 'sm:max-w-md',
      context: { projectId, projectName },
    });
  }

  protected openInvite(): void {
    this.dialogService.open(InviteClientDialog, {
      contentClass: 'sm:max-w-md',
      context: {
        clientId: this.clientId(),
        clientName: this.clientName(),
        projects: this.projects().map((p) => ({
          id: p.id,
          name: p.project.name,
        })),
      },
    });
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('');
  }

  protected readonly timeAgo = timeAgo;
}
