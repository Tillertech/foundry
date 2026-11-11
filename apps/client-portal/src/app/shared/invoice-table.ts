import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFolderKanban } from '@ng-icons/lucide';
import { isoDay, money } from '@foundry/shared-util';
import { StatusBadge } from '@foundry/shared-ui';
import { PortalAuthService } from '../domains/auth';
import { Invoice } from '../domains/invoices';

/**
 * Invoice rows as the client sees them everywhere (Invoices page, a
 * project's Invoices tab): which project each one is for, what it totals,
 * and what's still to pay. Selecting a row emits it; the project link goes
 * to that project instead.
 */
@Component({
  selector: 'app-invoice-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [RouterLink, NgIcon, StatusBadge],
  providers: [provideIcons({ lucideFolderKanban })],
  template: `
    <div class="surface-card overflow-x-auto">
      <table class="w-full min-w-[640px] text-sm">
        <thead>
          <tr class="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th class="px-4 py-2.5 font-medium">Invoice</th>
            <th class="px-4 py-2.5 font-medium">Due</th>
            <th class="px-4 py-2.5 text-right font-medium">Total</th>
            <th class="px-4 py-2.5 text-right font-medium">Still to pay</th>
            <th class="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (inv of invoices(); track inv.id) {
            <tr
              class="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40"
              tabindex="0"
              (click)="open.emit(inv)"
              (keydown.enter)="open.emit(inv)"
            >
              <td class="px-4 py-3">
                <span class="block font-mono text-xs font-semibold">{{ inv.number }}</span>
                @if (showProject()) {
                  @if (inv.project; as p) {
                    <a
                      [routerLink]="[base(), 'projects', p.id]"
                      (click)="$event.stopPropagation()"
                      class="mt-0.5 inline-flex max-w-[220px] items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-primary hover:underline"
                    >
                      <ng-icon name="lucideFolderKanban" size="11" class="shrink-0" />
                      <span class="truncate">{{ p.name }}</span>
                    </a>
                  } @else {
                    <span class="mt-0.5 block text-[11px] text-muted-foreground">General</span>
                  }
                }
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                {{ isoDay(inv.dueDate) }}
                <span class="block text-[11px]">Issued {{ isoDay(inv.issueDate) }}</span>
              </td>
              <td class="px-4 py-3 text-right font-medium tabular-nums">
                {{ money(inv.total, inv.currency) }}
              </td>
              <td class="px-4 py-3 text-right tabular-nums">
                @if (inv.status === 'cancelled') {
                  <span class="text-muted-foreground">-</span>
                } @else if (inv.balanceDue > 0) {
                  <span class="font-medium" [class.text-destructive]="inv.status === 'overdue'">
                    {{ money(inv.balanceDue, inv.currency) }}
                  </span>
                  @if (inv.amountPaid > 0) {
                    <span class="block text-[11px] text-muted-foreground">
                      {{ money(inv.amountPaid, inv.currency) }} paid
                    </span>
                  }
                } @else {
                  <span class="text-success">Paid</span>
                }
              </td>
              <td class="px-4 py-3"><app-status-badge [status]="inv.status" /></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class InvoiceTable {
  private readonly auth = inject(PortalAuthService);

  readonly invoices = input.required<Invoice[]>();
  /** Off inside a project's own tab, where it would just repeat itself. */
  readonly showProject = input(true);
  readonly open = output<Invoice>();

  protected readonly base = computed(() => `/${this.auth.slug() ?? ''}`);
  protected readonly isoDay = isoDay;
  protected readonly money = money;
}
