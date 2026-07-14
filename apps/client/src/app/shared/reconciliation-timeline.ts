import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { InvoicesApiService } from '../domains/invoices';
import { ProjectsApiService } from '../domains/projects';
import { ReconciliationEntry, isoDay, money, num } from '../domains/shared';

/**
 * Payment reconciliation timeline, viewable from an invoice (optionally
 * widened to its project), from a project, or both. Pass invoiceId for the
 * invoice view - a scope toggle appears when the invoice has a project -
 * or only projectId for the project-wide view.
 */
@Component({
  selector: 'app-reconciliation-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (invoiceId() && projectId()) {
      <div
        class="mb-3 inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      >
        @for (s of scopes; track s.id) {
          <button
            type="button"
            (click)="scope.set(s.id)"
            class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
            [class]="
              scope() === s.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            "
          >
            {{ s.label }}
          </button>
        }
      </div>
    }

    @if (loading()) {
      <p class="py-3 text-xs text-muted-foreground">Loading timeline…</p>
    } @else if (entries().length === 0) {
      <p class="py-3 text-xs text-muted-foreground">
        No payments reconciled yet.
      </p>
    } @else {
      <ol class="relative space-y-4 border-l border-border pl-4">
        @for (e of entries(); track e.id) {
          <li class="relative">
            <span
              class="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background"
              [class]="num(e.amount) < 0 ? 'bg-destructive' : 'bg-success'"
            ></span>
            <div class="flex items-baseline justify-between gap-3">
              <p class="text-sm font-medium">{{ e.note || label(e) }}</p>
              <p
                class="shrink-0 text-sm font-semibold tabular-nums"
                [class]="
                  num(e.amount) < 0 ? 'text-destructive' : 'text-success'
                "
              >
                {{ num(e.amount) < 0 ? '−' : '+'
                }}{{ money(abs(e.amount), e.currency) }}
              </p>
            </div>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ isoDay(e.createdAt) }}
              @if (e.invoiceBalance !== null) {
                · Invoice balance {{ money(e.invoiceBalance, e.currency) }}
              }
              @if (e.projectBalance !== null) {
                · Project budget left {{ money(e.projectBalance, e.currency) }}
              }
            </p>
          </li>
        }
      </ol>
    }
  `,
})
export class ReconciliationTimeline {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly projectsApi = inject(ProjectsApiService);

  readonly invoiceId = input<string | null>(null);
  readonly projectId = input<string | null>(null);

  protected readonly scopes = [
    { id: 'invoice' as const, label: 'This invoice' },
    { id: 'both' as const, label: 'Invoice + project' },
  ];
  protected readonly scope = signal<'invoice' | 'both'>('invoice');

  protected readonly entries = signal<ReconciliationEntry[]>([]);
  protected readonly loading = signal(false);

  constructor() {
    effect(() => {
      const invoiceId = this.invoiceId();
      const projectId = this.projectId();
      const scope = this.scope();

      if (!invoiceId && !projectId) {
        this.entries.set([]);
        return;
      }
      this.loading.set(true);
      const request = invoiceId
        ? this.invoicesApi.timeline(invoiceId, {
            includeProject: scope === 'both',
            take: 50,
          })
        : this.projectsApi.timeline(projectId as string, { take: 50 });
      request.subscribe({
        next: (res) => {
          this.entries.set(res.results);
          this.loading.set(false);
        },
        error: () => {
          this.entries.set([]);
          this.loading.set(false);
        },
      });
    });
  }

  protected label(e: ReconciliationEntry): string {
    return e.kind === 'payment_reversed'
      ? 'Payment reversed'
      : 'Payment applied';
  }

  protected abs(value: string): number {
    return Math.abs(num(value));
  }

  protected readonly money = money;
  protected readonly isoDay = isoDay;
  protected readonly num = num;
}
