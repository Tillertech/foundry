import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMailCheck, lucideSend } from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { Field } from '@foundry/shared-ui';
import { PortalSettingsStore, portalRoles } from './portal-settings.store';

export interface InviteClientDialogContext {
  clientId: string;
  clientName: string;
  projects: { id: string; name: string }[];
}

@Component({
  selector: 'app-invite-client-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [
    NgIcon,
    HlmDialogImports,
    HlmButton,
    HlmInput,
    HlmSelectImports,
    HlmCheckboxImports,
    Field,
  ],
  providers: [provideIcons({ lucideMailCheck, lucideSend })],
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Invite to client portal</h3>
      <p hlmDialogDescription>
        Give {{ ctx.clientName }} secure access to shared projects, documents,
        quotes and invoices.
      </p>
    </div>

    @if (sent()) {
      <div class="flex flex-col items-center gap-3 py-8 text-center">
        <div
          class="grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success"
        >
          <ng-icon name="lucideMailCheck" size="24" />
        </div>
        <div>
          <p class="text-sm font-semibold">Invitation sent</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ name() }} will receive an email at
            <span class="font-medium text-foreground">{{ email() }}</span>
            with a link to activate their portal account.
          </p>
        </div>
        <button
          hlmBtn
          size="sm"
          variant="outline"
          type="button"
          (click)="dialogRef.close()"
        >
          Done
        </button>
      </div>
    } @else {
      <div class="space-y-4 pt-1">
        <div class="grid grid-cols-2 gap-3">
          <app-field label="Full name">
            <input
              hlmInput
              class="w-full"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
              placeholder="Jane Doe"
            />
          </app-field>
          <app-field label="Role">
            <hlm-select
              class="w-full"
              [value]="role()"
              (valueChange)="role.set($event ?? roles[0])"
            >
              <hlm-select-trigger class="w-full"
                ><hlm-select-value
              /></hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                @for (r of roles; track r) {
                  <hlm-select-item [value]="r">{{ r }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
          </app-field>
        </div>

        <app-field label="Email address" [error]="error()" [hint]="emailHint()">
          <input
            hlmInput
            type="email"
            class="w-full"
            [value]="email()"
            (input)="onEmailInput($any($event.target).value)"
            placeholder="jane@client.com"
          />
        </app-field>

        <app-field label="Projects to share" [hint]="projectsHint()">
          <div class="space-y-1.5 rounded-lg border border-border p-2.5">
            @if (clientProjects.length === 0) {
              <p class="px-1 py-2 text-xs text-muted-foreground">
                This client has no projects yet.
              </p>
            }
            @for (p of clientProjects; track p.id) {
              <label
                [for]="p.id"
                class="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted"
              >
                <hlm-checkbox
                  [inputId]="p.id"
                  [checked]="selected().includes(p.id)"
                  (checkedChange)="toggleProject(p.id, !!$event)"
                />
                <span class="truncate">{{ p.name }}</span>
              </label>
            }
          </div>
        </app-field>

        <p
          class="rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
        >
          Portal permissions inherit your workspace defaults. You can override
          them per project in Settings - Client Portal.
        </p>

        <div hlmDialogFooter>
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            type="button"
            (click)="dialogRef.close()"
          >
            Cancel
          </button>
          <button
            hlmBtn
            size="sm"
            class="gap-1.5 shadow-[var(--shadow-glow)]"
            type="button"
            (click)="submit()"
          >
            <ng-icon name="lucideSend" size="14" />
            Send invitation
          </button>
        </div>
      </div>
    }
  `,
})
export class InviteClientDialog {
  protected readonly ctx = injectBrnDialogContext<InviteClientDialogContext>();
  protected readonly dialogRef = inject(BrnDialogRef);
  private readonly store = inject(PortalSettingsStore);

  protected readonly roles = portalRoles;
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly role = signal(portalRoles[0]);
  protected readonly selected = signal<string[]>([]);
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  protected readonly clientProjects = this.ctx.projects;

  protected readonly emailHint = computed(() =>
    this.error()
      ? undefined
      : "They'll set their own password from the invite link.",
  );
  protected readonly projectsHint = computed(() =>
    this.selected().length === 0
      ? "No selection shares all of this client's projects."
      : undefined,
  );

  protected onEmailInput(value: string): void {
    this.email.set(value);
    this.error.set('');
  }

  protected toggleProject(id: string, checked: boolean): void {
    this.selected.update((cur) =>
      checked ? [...cur, id] : cur.filter((x) => x !== id),
    );
  }

  protected submit(): void {
    const email = this.email().trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (!this.name().trim()) {
      this.error.set("Enter the contact's name.");
      return;
    }
    this.store.inviteUser({
      clientId: this.ctx.clientId,
      clientName: this.ctx.clientName,
      name: this.name().trim(),
      email,
      role: this.role(),
      projectIds: this.selected().length
        ? this.selected()
        : this.clientProjects.map((p) => p.id),
    });
    this.sent.set(true);
  }
}
