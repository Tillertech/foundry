import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBadgeCheck, lucideCheck, lucideReceipt } from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { Field } from '@foundry/shared-ui';
import { apiErrorMessage, Currency, money, num } from '@foundry/shared-util';
import { Milestone, MilestonesApiService } from '../domains/milestones';

export interface MilestoneSignoffContext {
  milestone: Milestone;
  currency: Currency;
  /** Project retention percent. */
  retentionPercent: number;
}

/**
 * Records the client's sign-off on a delivered milestone. Shows what is
 * being signed off (criteria + deliverables) and what billing it triggers,
 * so accepting never raises an invoice by surprise. Closes with the saved
 * milestone, or undefined on cancel.
 */
@Component({
  selector: 'app-milestone-signoff-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  imports: [NgIcon, HlmButton, HlmCheckboxImports, HlmDialogImports, HlmInput, Field],
  providers: [provideIcons({ lucideBadgeCheck, lucideCheck, lucideReceipt })],
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Record sign-off</h3>
      <p hlmDialogDescription>
        Confirm the client has accepted "{{ m.name }}". Use this for approvals
        given outside the portal - clients can also approve it there
        themselves.
      </p>
    </div>

    <form class="min-w-0 space-y-4 pt-2" (submit)="$event.preventDefault(); submit()">
      @if (m.acceptanceCriteria) {
        <div class="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Acceptance criteria
          </p>
          <p class="mt-1 whitespace-pre-line break-words text-sm">{{ m.acceptanceCriteria }}</p>
        </div>
      }

      @if (m.deliverables.length) {
        <div>
          <p class="mb-1.5 text-xs font-medium text-muted-foreground">
            Deliverables · {{ doneCount }} of {{ m.deliverables.length }} done
          </p>
          <ul class="space-y-1">
            @for (d of m.deliverables; track d.id) {
              <li class="flex items-center gap-2 text-sm" [class.text-muted-foreground]="!d.done">
                <span
                  class="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border"
                  [class]="d.done ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
                >
                  @if (d.done) {
                    <ng-icon name="lucideCheck" size="11" />
                  }
                </span>
                {{ d.label }}
              </li>
            }
          </ul>
          @if (doneCount < m.deliverables.length) {
            <p class="mt-1.5 text-xs text-warning">
              Some deliverables aren't ticked off yet.
            </p>
          }
        </div>
      }

      <app-field label="Signed off by" hint="Name, role or email of whoever confirmed.">
        <input
          #byInput
          hlmInput
          class="w-full"
          autocomplete="off"
          placeholder="Jane Doe, Product owner"
          [value]="acceptedBy()"
          (input)="acceptedBy.set(byInput.value)"
        />
      </app-field>

      @if (billing(); as b) {
        <div class="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
          <ng-icon name="lucideReceipt" size="16" class="mt-0.5 shrink-0 text-primary" />
          <p class="text-xs leading-5">
            A draft invoice for
            <span class="font-semibold tabular-nums">{{ fmt(b.net) }}</span>
            will be raised.
            @if (b.retained > 0) {
              {{ ctx.retentionPercent }}% ({{ fmt(b.retained) }}) is held back
              until the final milestone.
            }
            @if (m.releasesRetention) {
              As the final milestone, it also releases all retention held.
            }
            You review it before it's sent.
          </p>
        </div>
      }

      <div class="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
        <hlm-checkbox
          inputId="signoff-confirm"
          [checked]="confirmed()"
          (checkedChange)="confirmed.set($event)"
        />
        <label for="signoff-confirm" class="cursor-pointer text-xs leading-5">
          The client has confirmed that every acceptance criterion is met.
          Signing off can only be undone by reopening the milestone.
        </label>
      </div>

      @if (error()) {
        <p class="break-words text-xs text-destructive">{{ error() }}</p>
      }

      <div hlmDialogFooter class="pt-1">
        <button hlmBtn variant="ghost" size="sm" type="button" (click)="dialogRef.close()">
          Cancel
        </button>
        <button hlmBtn size="sm" type="submit" class="gap-1.5" [disabled]="saving() || !confirmed()">
          <ng-icon name="lucideBadgeCheck" size="14" />
          {{ saving() ? 'Saving…' : 'Mark accepted' }}
        </button>
      </div>
    </form>
  `,
})
export class MilestoneSignoffDialog {
  protected readonly dialogRef = inject<BrnDialogRef<Milestone | undefined>>(BrnDialogRef);
  protected readonly ctx = injectBrnDialogContext<MilestoneSignoffContext>();
  private readonly api = inject(MilestonesApiService);

  protected readonly m = this.ctx.milestone;
  protected readonly doneCount = this.m.deliverables.filter((d) => d.done).length;
  protected readonly acceptedBy = signal(this.m.acceptedBy ?? '');
  protected readonly saving = signal(false);
  /** Explicit "the client really accepted" tick before signing off. */
  protected readonly confirmed = signal(false);
  protected readonly error = signal('');

  /** What accepting will bill - null when nothing is raised automatically. */
  protected readonly billing = computed(() => {
    const amount = num(this.m.amount);
    if (!amount || this.m.invoice || this.m.billingTrigger !== 'on_acceptance') {
      return null;
    }
    const retained = this.m.releasesRetention
      ? 0
      : Math.round(amount * this.ctx.retentionPercent) / 100;
    return { net: amount - retained, retained };
  });

  protected submit(): void {
    if (this.saving() || !this.confirmed()) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .update(this.m.id, {
        status: 'accepted',
        acceptedBy: this.acceptedBy().trim() || undefined,
      })
      .subscribe({
        next: (saved) => this.dialogRef.close(saved),
        error: (err) => {
          this.saving.set(false);
          this.error.set(apiErrorMessage(err));
        },
      });
  }

  protected fmt(n: number): string {
    return money(n, this.ctx.currency);
  }
}
