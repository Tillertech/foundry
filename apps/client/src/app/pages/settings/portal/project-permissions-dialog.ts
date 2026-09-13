import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { capabilityMeta, PortalCapabilities, PortalSettingsStore, ProjectAccess } from './portal-settings.store';

export interface ProjectPermissionsDialogContext {
  projectId: string;
  projectName: string;
}

@Component({
  selector: 'app-project-permissions-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [HlmDialogImports, HlmButton, HlmCheckboxImports],
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Permissions - {{ ctx.projectName }}</h3>
      <p hlmDialogDescription>Override workspace defaults for this project only.</p>
    </div>

    @if (access(); as a) {
      <label
        for="use-defaults"
        class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted"
      >
        <hlm-checkbox
          inputId="use-defaults"
          [checked]="a.useDefaults"
          (checkedChange)="store.setProjectAccess(ctx.projectId, { useDefaults: !!$event })"
        />
        Use workspace default permissions
      </label>

      @if (!a.useDefaults) {
        <div class="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          @for (c of capabilities; track c.key) {
            <label
              [for]="c.key"
              class="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <span>{{ c.label }}</span>
              <hlm-checkbox
                [inputId]="c.key"
                [checked]="a.overrides[c.key]"
                (checkedChange)="setOverride(a, c.key, !!$event)"
              />
            </label>
          }
        </div>
      }
    }

    <div hlmDialogFooter>
      <button hlmBtn size="sm" type="button" (click)="dialogRef.close()">Done</button>
    </div>
  `,
})
export class ProjectPermissionsDialog {
  protected readonly ctx = injectBrnDialogContext<ProjectPermissionsDialogContext>();
  protected readonly dialogRef = inject(BrnDialogRef);
  protected readonly store = inject(PortalSettingsStore);

  protected readonly capabilities = capabilityMeta;
  protected readonly access = computed(() => this.store.projectAccess()[this.ctx.projectId]);

  protected setOverride(access: ProjectAccess, key: keyof PortalCapabilities, value: boolean): void {
    this.store.setProjectAccess(this.ctx.projectId, { overrides: { ...access.overrides, [key]: value } });
  }
}
