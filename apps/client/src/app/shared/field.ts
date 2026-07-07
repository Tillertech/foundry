import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="mb-1.5 block text-xs font-medium text-muted-foreground">{{ label() }}</span>
    <ng-content />
    @if (hint() && !error()) {
      <p class="mt-1 text-[11px] text-muted-foreground">{{ hint() }}</p>
    }
    @if (error()) {
      <p class="mt-1 text-[11px] text-destructive">{{ error() }}</p>
    }
  `,
  host: { class: 'block' },
})
export class Field {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string>();
}
