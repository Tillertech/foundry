import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  input,
} from '@angular/core';

@Component({
  selector: 'app-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Unencapsulated so the invalid outline reaches the projected control.
  encapsulation: ViewEncapsulation.None,
  template: `
    <span class="mb-1.5 block text-xs font-medium text-muted-foreground">{{
      label()
    }}</span>
    <ng-content />
    @if (error()) {
      <p
        class="mt-1 flex items-start gap-1 text-[11px] leading-snug text-destructive"
        role="alert"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          class="mt-px h-3 w-3 shrink-0 fill-current"
        >
          <path
            d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4.5Zm0 6.25a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"
          />
        </svg>
        <span>{{ error() }}</span>
      </p>
    } @else if (warning()) {
      <p class="mt-1 text-[11px] leading-snug text-warning">{{ warning() }}</p>
    } @else if (hint()) {
      <p class="mt-1 text-[11px] text-muted-foreground">{{ hint() }}</p>
    }
  `,
  styles: `
    app-field[data-invalid]
      :is(
        [data-slot='input'],
        [data-slot='textarea'],
        [data-slot='input-group'],
        [data-slot='popover-trigger']
      ) {
      border-color: var(--destructive);
      box-shadow: 0 0 0 3px
        color-mix(in oklch, var(--destructive) 18%, transparent);
    }
  `,
  host: {
    class: 'block',
    '[attr.data-invalid]': 'error() ? "" : null',
  },
})
export class Field {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly warning = input<string>();
  readonly error = input<string>();
}
