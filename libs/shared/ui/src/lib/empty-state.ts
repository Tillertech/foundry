import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="surface-card flex flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div
        class="grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground"
      >
        <span class="font-mono text-lg">∅</span>
      </div>
      <p class="mt-4 text-sm font-semibold">{{ title() }}</p>
      @if (description()) {
        <p class="mt-1 max-w-sm text-xs text-muted-foreground">
          {{ description() }}
        </p>
      }
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly description = input<string>();
}
