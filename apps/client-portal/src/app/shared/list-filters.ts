import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { AutocompleteOption, OptionAutocomplete } from '@foundry/shared-ui';
import { PortalAuthService } from '../domains/auth';
import { ProjectsApiService } from '../domains/projects';

export interface FilterOption {
  value: string;
  label: string;
}

/** The "no filter" value of the first dropdown. */
export const ANY = 'all';

/**
 * The filter row above the portal's lists: one dropdown (status, method...)
 * and a project picker - the latter only when the portal shows projects,
 * listing just the projects this user can open. Emits `changed` after any
 * change so the page refetches; filtering itself is server-side.
 */
@Component({
  selector: 'app-list-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmSelectImports, OptionAutocomplete],
  providers: [provideIcons({ lucideX })],
  host: { class: 'mb-4 flex flex-wrap items-center gap-2' },
  template: `
    <hlm-select
      class="w-full sm:w-[200px]"
      [value]="value()"
      (valueChange)="setValue($event)"
      [itemToString]="label"
    >
      <hlm-select-trigger class="h-9 w-full" [attr.aria-label]="ariaLabel()">
        <hlm-select-value />
      </hlm-select-trigger>
      <hlm-select-content *hlmSelectPortal>
        <hlm-select-item [value]="any">{{ allLabel() }}</hlm-select-item>
        @for (o of options(); track o.value) {
          <hlm-select-item [value]="o.value">{{ o.label }}</hlm-select-item>
        }
      </hlm-select-content>
    </hlm-select>

    @if (canFilterProjects()) {
      <app-option-autocomplete
        class="w-full sm:w-[240px]"
        placeholder="All projects"
        emptyText="No project found"
        [options]="projectOptions()"
        [value]="projectId()"
        (valueChange)="setProject($event)"
      />
    }

    @if (active()) {
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        (click)="clear()"
      >
        <ng-icon name="lucideX" size="13" />
        Clear filters
      </button>
    }
  `,
})
export class ListFilters {
  private readonly auth = inject(PortalAuthService);
  private readonly projectsApi = inject(ProjectsApiService);

  /** Choices of the dropdown, besides "all". */
  readonly options = input.required<readonly FilterOption[]>();
  readonly allLabel = input('All statuses');
  readonly ariaLabel = input('Filter by status');
  /** Dropdown value; `ANY` when unfiltered. */
  readonly value = model<string>(ANY);
  /** '' when unfiltered. */
  readonly projectId = model('');
  readonly changed = output<void>();

  protected readonly any = ANY;

  protected readonly canFilterProjects = computed(
    () => this.auth.me()?.clientPortal.permission.viewProjects ?? false,
  );
  private readonly projects = signal<{ id: string; name: string }[]>([]);
  protected readonly projectOptions = computed<AutocompleteOption[]>(() => [
    { value: '', label: 'All projects' },
    ...this.projects().map((p) => ({ value: p.id, label: p.name })),
  ]);

  readonly active = computed(() => this.value() !== ANY || !!this.projectId());

  protected readonly label = (v: string) =>
    v === ANY
      ? this.allLabel()
      : (this.options().find((o) => o.value === v)?.label ?? v);

  constructor() {
    if (this.canFilterProjects()) {
      this.projectsApi.list({ take: 100 }).subscribe({
        next: (res) => this.projects.set(res.results),
        error: () => undefined,
      });
    }
  }

  protected setValue(v: string | null | undefined): void {
    const next = v || ANY;
    if (next === this.value()) return;
    this.value.set(next);
    this.changed.emit();
  }

  protected setProject(id: string): void {
    if (id === this.projectId()) return;
    this.projectId.set(id);
    this.changed.emit();
  }

  protected clear(): void {
    this.value.set(ANY);
    this.projectId.set('');
    this.changed.emit();
  }
}
