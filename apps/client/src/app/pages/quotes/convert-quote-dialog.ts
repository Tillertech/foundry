import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFlag,
  lucideFolderPlus,
  lucideHandCoins,
  lucideInfo,
} from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { Field } from '@foundry/shared-ui';
import {
  apiErrorMessage,
  money,
  num,
  quoteTotal,
  toApiDate,
} from '@foundry/shared-util';
import { Quote, QuoteConversion, QuotesApiService } from '../../domains/quotes';
import { DateField } from '../../shared/date-field';
import { milestoneSchedule } from './quote-schedule';

export interface ConvertQuoteDialogContext {
  quote: Quote;
  clientName: string;
}

/**
 * Accept-and-start: previews the project the quote will become (budget,
 * retention, the milestone billing schedule) and creates it in one call.
 * Closes with the QuoteConversion, or undefined on cancel.
 */
@Component({
  selector: 'app-convert-quote-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  imports: [
    NgIcon,
    HlmButton,
    HlmDialogImports,
    HlmInput,
    HlmSwitchImports,
    Field,
    DateField,
  ],
  providers: [
    provideIcons({ lucideFlag, lucideFolderPlus, lucideHandCoins, lucideInfo }),
  ],
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Start the project</h3>
      <p hlmDialogDescription>
        @if (quote.status === 'accepted') {
          {{ quote.number }} is accepted{{ responder ? ' by ' + responder : '' }}.
          Set up the project, milestones and billing schedule for
          {{ ctx.clientName }}.
        } @else {
          Accept {{ quote.number }} for {{ ctx.clientName }} and set up its
          project, milestones and billing schedule.
        }
      </p>
    </div>

    <form class="min-w-0 space-y-4 pt-2" (submit)="$event.preventDefault(); submit()">
      <!-- What gets created -->
      <div class="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-muted/30 text-center [&>div]:min-w-0">
        <div class="px-2 py-2.5">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Budget</p>
          <p class="mt-0.5 break-words text-xs font-semibold tabular-nums sm:text-sm">{{ fmt(totals.subtotal) }}</p>
        </div>
        <div class="px-2 py-2.5">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Milestones</p>
          <p class="mt-0.5 break-words text-xs font-semibold tabular-nums sm:text-sm">{{ schedule.length }}</p>
        </div>
        <div class="px-2 py-2.5">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Retention</p>
          <p class="mt-0.5 break-words text-xs font-semibold tabular-nums sm:text-sm">{{ retention ? retention + '%' : 'None' }}</p>
        </div>
      </div>

      @if (schedule.length) {
        <div>
          <p class="mb-1.5 text-xs font-medium text-muted-foreground">Billing schedule</p>
          <ol class="scrollbar-thin max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            @for (m of schedule; track m.id; let i = $index; let last = $last) {
              <li class="flex items-center gap-2.5 px-3 py-2 text-sm text-wrap">
                <span class="w-8 shrink-0 font-mono text-[10px] font-semibold text-primary">M{{ pad(i + 1) }}</span>
                <span class="min-w-0 flex-1 truncate" [title]="m.description">{{ m.description || 'Untitled milestone' }}</span>
                @if (i === 0 && invoiceFirst()) {
                  <span class="shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">Upfront</span>
                }
                @if (last && retention) {
                  <span class="shrink-0 rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success">Releases retention</span>
                }
                <span class="shrink-0 tabular-nums text-muted-foreground">{{ fmt(num(m.quantity) * num(m.rate)) }}</span>
              </li>
            }
          </ol>
        </div>
      } @else {
        <p class="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          <ng-icon name="lucideInfo" size="14" class="mt-px shrink-0" />
          This quote has no milestone lines, so the project starts without
          milestones. You can add them from the project afterwards.
        </p>
      }

      <app-field label="Project name" [error]="nameError()">
        <input
          #nameInput
          hlmInput
          class="w-full"
          autocomplete="off"
          [value]="name()"
          (input)="name.set(nameInput.value)"
        />
      </app-field>

      <div class="grid gap-3 sm:grid-cols-2">
        <app-field label="Start date">
          <app-date-field [value]="startDate()" (valueChange)="startDate.set($event ?? '')" />
        </app-field>
        <app-field label="Target end">
          <app-date-field [value]="endDate()" (valueChange)="endDate.set($event ?? '')" />
        </app-field>
      </div>

      <app-field
        [label]="'Hourly rate (' + quote.currency + ')'"
        hint="Optional. Used to price change requests and out-of-scope work."
      >
          <input
            #rateInput
            hlmInput
            type="number"
            min="0"
            class="w-full"
            [value]="hourlyRate() ?? ''"
            (input)="hourlyRate.set(rateInput.value === '' ? null : +rateInput.value)"
          />
        </app-field>

      @if (schedule.length) {
        <div class="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <span class="flex min-w-0 gap-2.5">
            <ng-icon name="lucideHandCoins" size="16" class="mt-0.5 shrink-0 text-muted-foreground" />
            <span class="min-w-0">
              <span class="block text-sm font-medium">Invoice the first milestone now</span>
              <span class="block text-xs text-muted-foreground">
                Raises a draft invoice for M01 as a deposit. Every other
                milestone is invoiced when the client signs it off.
              </span>
            </span>
          </span>
          <hlm-switch
            [checked]="invoiceFirst()"
            (checkedChange)="invoiceFirst.set($event)"
            aria-label="Invoice the first milestone now"
          />
        </div>
      }

      @if (error()) {
        <p class="break-words text-xs text-destructive">{{ error() }}</p>
      }

      <div hlmDialogFooter class="flex-wrap pt-1">
        <button hlmBtn variant="ghost" size="sm" type="button" (click)="dialogRef.close()">
          Not now
        </button>
        <button hlmBtn size="sm" type="submit" class="gap-1.5" [disabled]="saving() || !!nameError()">
          <ng-icon name="lucideFolderPlus" size="14" />
          {{
            saving()
              ? 'Creating…'
              : quote.status === 'accepted'
                ? 'Create project'
                : 'Accept and create project'
          }}
        </button>
      </div>
    </form>
  `,
})
export class ConvertQuoteDialog {
  protected readonly dialogRef = inject<BrnDialogRef<QuoteConversion | undefined>>(BrnDialogRef);
  protected readonly ctx = injectBrnDialogContext<ConvertQuoteDialogContext>();
  private readonly api = inject(QuotesApiService);

  protected readonly quote = this.ctx.quote;
  protected readonly totals = quoteTotal(this.quote);
  protected readonly retention = num(this.quote.retentionPercent);
  /** Who accepted in the portal ("Ada"), if the client did. */
  protected readonly responder =
    (this.quote.respondedBy ?? '').replace(/\s*<[^>]*>$/, '') || null;
  /** Mirrors the API's billing order (picked options before the hand-over). */
  protected readonly schedule = milestoneSchedule(this.quote.items);

  protected readonly name = signal(`${this.ctx.clientName} - ${this.quote.number}`);
  protected readonly startDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly endDate = signal('');
  protected readonly hourlyRate = signal<number | null>(null);
  protected readonly invoiceFirst = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected readonly nameError = computed(() =>
    this.name().trim() ? undefined : 'Give the project a name',
  );

  protected submit(): void {
    if (this.saving() || this.nameError()) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .convert(this.quote.id, {
        name: this.name().trim(),
        startDate: toApiDate(this.startDate()),
        endDate: this.endDate() ? toApiDate(this.endDate()) : undefined,
        hourlyRate: this.hourlyRate() ?? undefined,
        invoiceFirstMilestone: this.invoiceFirst() || undefined,
      })
      .subscribe({
        next: (result) => this.dialogRef.close(result),
        error: (err) => {
          this.saving.set(false);
          this.error.set(apiErrorMessage(err));
        },
      });
  }

  protected fmt(n: number): string {
    return money(n, this.quote.currency);
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected readonly num = num;
}
