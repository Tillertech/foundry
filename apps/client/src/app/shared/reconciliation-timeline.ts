import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { InvoicesApiService } from '../domains/invoices';
import { ProjectsApiService } from '../domains/projects';
import { ReconciliationEntry, isoDay, money, num } from '../domains/shared';
import { InvoiceDetailsDialog } from './invoice-details-dialog';

@Component({
  selector: 'app-reconciliation-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Without this, the host defaults to `display: inline` (the UA default
  // for an unrecognized element), which makes the block-level <ol> below it
  // size to shrink-to-fit content instead of stretching to the sheet's
  // width - every row's intrinsic (unwrapped) text width then wins, which
  // is what forced the whole side drawer to overflow horizontally.
  host: { class: 'block' },
  template: `
    @if (invoiceId() && projectId()) {
      <div
        class="mb-3 flex w-fit max-w-full flex-wrap rounded-lg border border-border bg-muted/40 p-0.5"
      >
        @for (s of scopes; track s.id) {
          <button
            type="button"
            (click)="scope.set(s.id)"
            class="rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors"
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
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div class="flex min-w-0 max-w-full items-center gap-2">
                <p class="min-w-0 truncate text-sm font-medium">
                  {{ e.note || label(e) }}
                </p>
                @if (showInvoiceBadge(e)) {
                  <button
                    type="button"
                    (click)="openInvoice(e)"
                    class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    {{ e.invoiceNumber }}
                  </button>
                }
              </div>
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
                · {{ invoiceBalanceLabel(e) }}
                {{ money(e.invoiceBalance, e.currency) }}
              }
              @if (e.projectBalance !== null && showProjectBalance(e)) {
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
  private readonly dialogService = inject(HlmDialogService);

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

  /**
   * The invoice number badge only earns its place once entries from more
   * than one invoice can appear side by side: a pure project view (always
   * mixed), or the invoice's "Invoice + project" tab for entries that
   * belong to a *different* invoice on the same project. On a plain
   * single-invoice view it would just repeat what the page is already
   * showing.
   */
  protected showInvoiceBadge(e: ReconciliationEntry): boolean {
    if (!e.invoiceNumber || !e.invoiceId) return false;
    if (!this.projectId()) return false;
    if (!this.invoiceId()) return true;
    return this.scope() === 'both' && e.invoiceId !== this.invoiceId();
  }

  /** Labels the balance with the owning invoice's number once entries can belong to more than one invoice. */
  protected invoiceBalanceLabel(e: ReconciliationEntry): string {
    const ambiguous =
      !!this.projectId() && (!this.invoiceId() || e.invoiceId !== this.invoiceId());
    return ambiguous && e.invoiceNumber
      ? `${e.invoiceNumber} balance`
      : 'Invoice balance';
  }

  /**
   * Project budget only renders once the view is project-aware - showing it
   * next to the invoice balance on a single-invoice-only timeline just reads
   * as the same number twice.
   */
  protected showProjectBalance(e: ReconciliationEntry): boolean {
    if (e.projectBalance === null) return false;
    return !this.invoiceId() || this.scope() === 'both';
  }

  protected openInvoice(e: ReconciliationEntry): void {
    if (!e.invoiceId) return;
    this.dialogService.open(InvoiceDetailsDialog, {
      contentClass: 'sm:max-w-lg',
      context: { invoiceId: e.invoiceId },
    });
  }

  protected readonly money = money;
  protected readonly isoDay = isoDay;
  protected readonly num = num;
}
