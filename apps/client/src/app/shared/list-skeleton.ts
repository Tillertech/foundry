import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Shimmer placeholder shown while page content loads:
 * `variant="rows"` mimics list/table pages, `variant="cards"` the card grids.
 */
@Component({
  selector: 'app-list-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'cards') {
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        @for (i of items(); track i) {
          <div class="surface-card p-5">
            <div class="skeleton-shimmer h-4 w-2/3 rounded-md"></div>
            <div class="skeleton-shimmer mt-2 h-3 w-1/3 rounded-md"></div>
            <div class="mt-5 grid grid-cols-2 gap-3">
              <div class="skeleton-shimmer h-8 rounded-md"></div>
              <div class="skeleton-shimmer h-8 rounded-md"></div>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="surface-card overflow-hidden">
        <div class="border-b border-border bg-muted/40 px-5 py-3">
          <div class="skeleton-shimmer h-3 w-48 rounded-md"></div>
        </div>
        <div class="divide-y divide-border">
          @for (i of items(); track i) {
            <div class="flex items-center gap-3 px-5 py-3.5">
              <div class="skeleton-shimmer h-9 w-9 shrink-0 rounded-lg"></div>
              <div class="min-w-0 flex-1 space-y-1.5">
                <div class="skeleton-shimmer h-3.5 w-1/3 rounded-md"></div>
                <div class="skeleton-shimmer h-3 w-1/4 rounded-md"></div>
              </div>
              <div class="skeleton-shimmer h-4 w-16 rounded-md"></div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ListSkeleton {
  readonly rows = input(6);
  readonly variant = input<'rows' | 'cards'>('rows');

  protected readonly items = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
}
