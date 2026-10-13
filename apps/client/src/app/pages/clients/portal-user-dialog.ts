import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderKanban,
  lucideLayers,
  lucideMailCheck,
  lucideSearch,
  lucideSend,
} from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { Field } from '@foundry/shared-ui';
import { apiErrorMessage } from '@foundry/shared-util';
import {
  PortalUser,
  PortalUserAccess,
  PortalUsersApiService,
} from '../../domains/portal-users';

export interface PortalUserDialogProject {
  id: string;
  name: string;
  /** Whether the project is currently shared into the portal. */
  shared: boolean;
}

export interface PortalUserDialogContext {
  clientPortalId: string;
  clientName: string;
  /** Every project of the client, shared or not. */
  projects: PortalUserDialogProject[];
  /** Human list of what the portal shows ("Projects, Documents, …"). */
  permissionSummary: string;
  /** Whether those permissions are the workspace defaults or the portal's own. */
  inheritsPermissions: boolean;
  /** Set to manage an existing user's access instead of inviting a new one. */
  user?: PortalUser;
}

type AccessMode = 'all' | 'selected';

/**
 * Invites a user to a client portal, or edits an existing user's details and
 * project access. Closes with the saved PortalUser (undefined on cancel).
 *
 * Project access defaults to "all shared projects": the user simply inherits
 * whatever the portal shares, now and later. "Specific projects" narrows that
 * to a hand-picked, searchable list.
 */
@Component({
  selector: 'app-portal-user-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [
    NgIcon,
    HlmDialogImports,
    HlmButton,
    HlmInput,
    HlmCheckboxImports,
    Field,
  ],
  providers: [
    provideIcons({
      lucideFolderKanban,
      lucideLayers,
      lucideMailCheck,
      lucideSearch,
      lucideSend,
    }),
  ],
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>
        {{ editing ? 'Manage portal access' : 'Invite to client portal' }}
      </h3>
      <p hlmDialogDescription>
        @if (editing) {
          Update {{ ctx.user!.name }}'s details and the projects they can see in
          {{ ctx.clientName }}'s portal.
        } @else {
          Give someone at {{ ctx.clientName }} their own sign-in to the client
          portal.
        }
      </p>
    </div>

    @if (invited(); as user) {
      <div class="flex flex-col items-center gap-3 py-8 text-center">
        <div
          class="grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success"
        >
          <ng-icon name="lucideMailCheck" size="24" />
        </div>
        <div>
          <p class="text-sm font-semibold">Invitation sent</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ user.name }} will receive an email at
            <span class="font-medium text-foreground">{{ user.email }}</span>
            with a link to set a password. The link is valid for 7 days.
          </p>
        </div>
        <button
          hlmBtn
          size="sm"
          variant="outline"
          type="button"
          (click)="dialogRef.close(user)"
        >
          Done
        </button>
      </div>
    } @else {
      <form class="space-y-4 pt-3" (submit)="$event.preventDefault(); submit()">
        <div class="grid gap-3 sm:grid-cols-2">
          <app-field label="Full name" [error]="nameError()">
            <input
              #nameInput
              hlmInput
              class="w-full"
              autocomplete="off"
              placeholder="Jane Doe"
              [value]="name()"
              (input)="name.set(nameInput.value)"
            />
          </app-field>
          <app-field
            label="Email address"
            [error]="emailError()"
            [hint]="
              editing ? undefined : 'They set their own password from the link.'
            "
          >
            <input
              #emailInput
              hlmInput
              type="email"
              class="w-full"
              autocomplete="off"
              placeholder="jane@client.com"
              [value]="email()"
              (input)="email.set(emailInput.value)"
            />
          </app-field>
        </div>

        <div>
          <p class="mb-1.5 text-xs font-medium text-muted-foreground">
            Project access
          </p>
          <div
            class="grid gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-label="Project access"
          >
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="mode() === 'all'"
              (click)="mode.set('all')"
              class="flex flex-col justify-start rounded-lg border px-3 py-2.5 text-left transition-colors"
              [class]="
                mode() === 'all'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-muted/50'
              "
            >
              <span class="flex items-center gap-2 text-sm font-medium">
                <ng-icon name="lucideLayers" size="15" />
                All shared projects
              </span>
              <span class="mt-1 block text-[11px] text-muted-foreground">
                Follows the portal: {{ sharedCount }} shared now, plus any
                shared later.
              </span>
            </button>
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="mode() === 'selected'"
              [disabled]="ctx.projects.length === 0"
              (click)="mode.set('selected')"
              class="flex flex-col justify-start rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              [class]="
                mode() === 'selected'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-muted/50'
              "
            >
              <span class="flex items-center gap-2 text-sm font-medium">
                <ng-icon name="lucideFolderKanban" size="15" />
                Specific projects
              </span>
              <span class="mt-1 block text-[11px] text-muted-foreground">
                @if (ctx.projects.length === 0) {
                  This client has no projects yet.
                } @else {
                  Only the projects you pick below.
                }
              </span>
            </button>
          </div>

          @if (mode() === 'selected') {
            <div class="mt-2 rounded-lg border border-border">
              <div
                class="flex items-center gap-2 border-b border-border px-2.5 py-1.5"
              >
                <ng-icon
                  name="lucideSearch"
                  size="14"
                  class="shrink-0 text-muted-foreground"
                />
                <input
                  #projectSearch
                  type="text"
                  class="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Search projects…"
                  aria-label="Search projects"
                  [value]="query()"
                  (input)="query.set(projectSearch.value)"
                />
                <span
                  class="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                >
                  {{ selected().size }} of {{ ctx.projects.length }}
                </span>
              </div>
              <div class="max-h-48 overflow-y-auto p-1.5">
                @for (p of filteredProjects(); track p.id) {
                  <label
                    [for]="'pud-' + p.id"
                    class="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted"
                  >
                    <hlm-checkbox
                      [inputId]="'pud-' + p.id"
                      [checked]="selected().has(p.id)"
                      (checkedChange)="toggleProject(p.id, !!$event)"
                    />
                    <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
                    @if (!p.shared) {
                      <span
                        class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        title="Hidden until the project is shared to the portal"
                      >
                        Not shared
                      </span>
                    }
                  </label>
                } @empty {
                  <p
                    class="px-1.5 py-3 text-center text-xs text-muted-foreground"
                  >
                    No projects match “{{ query() }}”.
                  </p>
                }
              </div>
              <div
                class="flex items-center justify-between border-t border-border px-2.5 py-1.5 text-[11px]"
              >
                <button
                  type="button"
                  class="font-medium text-primary hover:underline"
                  (click)="selectVisible()"
                >
                  Select {{ query() ? 'matching' : 'all' }}
                </button>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground"
                  [disabled]="selected().size === 0"
                  (click)="selected.set(emptySelection)"
                >
                  Clear
                </button>
              </div>
            </div>
            @if (projectsError(); as message) {
              <p class="mt-1 text-[11px] text-destructive">{{ message }}</p>
            } @else if (hiddenSelected() > 0) {
              <p class="mt-1 text-[11px] text-muted-foreground">
                {{ hiddenSelected() }} selected
                {{ hiddenSelected() === 1 ? 'project is' : 'projects are' }}
                not shared to the portal yet and will stay hidden until
                {{ hiddenSelected() === 1 ? 'it is' : 'they are' }}.
              </p>
            }
          }
        </div>

        <p
          class="rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
        >
          @if (ctx.permissionSummary) {
            Can view: {{ ctx.permissionSummary }}
          } @else {
            Nothing is switched on for this portal yet
          }
          -
          {{
            ctx.inheritsPermissions
              ? 'your workspace defaults'
              : "this portal's own permissions"
          }}. Permissions apply to everyone in the portal.
        </p>

        @if (error(); as message) {
          <p
            class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <div hlmDialogFooter>
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            type="button"
            [disabled]="saving()"
            (click)="dialogRef.close()"
          >
            Cancel
          </button>
          <button
            hlmBtn
            size="sm"
            class="gap-1.5 shadow-[var(--shadow-glow)]"
            type="submit"
            [disabled]="saving()"
          >
            @if (!editing) {
              <ng-icon name="lucideSend" size="14" />
            }
            {{ submitLabel() }}
          </button>
        </div>
      </form>
    }
  `,
})
export class PortalUserDialog {
  protected readonly ctx = injectBrnDialogContext<PortalUserDialogContext>();
  protected readonly dialogRef =
    inject<BrnDialogRef<PortalUser | undefined>>(BrnDialogRef);
  private readonly portalUsersApi = inject(PortalUsersApiService);

  protected readonly editing = !!this.ctx.user;
  protected readonly sharedCount = this.ctx.projects.filter((p) => p.shared)
    .length;
  protected readonly emptySelection: ReadonlySet<string> = new Set();

  protected readonly name = signal(this.ctx.user?.name ?? '');
  protected readonly email = signal(this.ctx.user?.email ?? '');
  protected readonly mode = signal<AccessMode>(
    this.ctx.user && !this.ctx.user.allProjects ? 'selected' : 'all',
  );
  protected readonly selected = signal<ReadonlySet<string>>(
    new Set(this.ctx.user?.projectIds ?? []),
  );
  protected readonly query = signal('');

  /** Validation messages stay quiet until the first submit attempt. */
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly invited = signal<PortalUser | null>(null);

  protected readonly filteredProjects = computed(() => {
    const term = this.query().trim().toLowerCase();
    return term
      ? this.ctx.projects.filter((p) => p.name.toLowerCase().includes(term))
      : this.ctx.projects;
  });

  /** Picked projects the portal doesn't share yet - allowed, but invisible for now. */
  protected readonly hiddenSelected = computed(
    () =>
      this.ctx.projects.filter((p) => !p.shared && this.selected().has(p.id))
        .length,
  );

  protected readonly nameError = computed(() =>
    this.submitted() && !this.name().trim() ? "Enter the person's name." : '',
  );
  protected readonly emailError = computed(() =>
    this.submitted() && !/^\S+@\S+\.\S+$/.test(this.email().trim())
      ? 'Enter a valid email address.'
      : '',
  );
  protected readonly projectsError = computed(() =>
    this.submitted() && this.mode() === 'selected' && this.selected().size === 0
      ? 'Pick at least one project, or choose all shared projects.'
      : '',
  );

  protected readonly submitLabel = computed(() => {
    if (this.saving()) return this.editing ? 'Saving…' : 'Sending…';
    return this.editing ? 'Save changes' : 'Send invitation';
  });

  protected toggleProject(id: string, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Adds everything currently listed (all projects, or the search matches). */
  protected selectVisible(): void {
    this.selected.update(
      (current) =>
        new Set([...current, ...this.filteredProjects().map((p) => p.id)]),
    );
  }

  protected submit(): void {
    this.submitted.set(true);
    this.error.set('');
    if (
      this.saving() ||
      this.nameError() ||
      this.emailError() ||
      this.projectsError()
    ) {
      return;
    }

    const access: PortalUserAccess =
      this.mode() === 'all'
        ? { allProjects: true }
        : { allProjects: false, projectIds: [...this.selected()] };
    const profile = { name: this.name().trim(), email: this.email().trim() };

    this.saving.set(true);
    const user = this.ctx.user;
    const request = user
      ? this.portalUsersApi.update(user.id, { ...profile, ...access })
      : this.portalUsersApi.create({
          clientPortalId: this.ctx.clientPortalId,
          ...profile,
          ...access,
        });
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        // An invite gets a confirmation step; an edit just closes.
        if (user) this.dialogRef.close(saved);
        else this.invited.set(saved);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(
          apiErrorMessage(
            err,
            user ? 'Could not save changes.' : 'Could not send the invitation.',
          ),
        );
      },
    });
  }
}
