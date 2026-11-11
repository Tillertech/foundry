import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideCheck,
  lucideChevronDown,
  lucideCircleCheck,
  lucideExternalLink,
  lucideFileText,
  lucideHistory,
  lucideListChecks,
  lucideLock,
  lucideMessageSquare,
  lucideMessageSquarePlus,
  lucideUndo2,
} from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage, Currency, isoDay, money, num } from '@foundry/shared-util';
import { DocumentsApiService } from '../../domains/documents';
import { ProjectMilestone, ProjectsApiService } from '../../domains/projects';
import { saveBlob } from '../../core/download-file';

export interface MilestoneReviewContext {
  projectId: string;
  projectName: string;
  milestone: ProjectMilestone;
  /** Position in the plan, for the "M03" eyebrow. */
  index: number;
  currency: Currency;
  retentionPercent: number;
  canApprove: boolean;
  /** Files this user can open, by id (others show as "shared with the team"). */
  documents: ReadonlyMap<string, { id: string; name: string }>;
}

export type MilestoneReviewResult = 'approved' | 'changes_requested';

type Step = 'review' | 'confirm-approve' | 'confirm-changes' | 'done';

/**
 * The client's review of one delivered milestone, laid out in the order a
 * reviewer works: what was delivered (with its evidence, and a place for a
 * note on each item), what "done" means (the acceptance criteria, ticked
 * off), anything general, then one decision - each through a confirmation
 * that states its consequence. Earlier rounds stay visible underneath.
 */
@Component({
  selector: 'app-milestone-review-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The dialog pane sizes to its content, so the review sets its own width
  // (viewport-capped on phones) rather than relying on max-w alone.
  host: { class: 'flex min-h-0 min-w-0 flex-col w-[calc(100vw-4rem)] sm:w-[44rem]' },
  imports: [NgIcon, HlmButton, HlmCheckboxImports, HlmDialogImports, HlmTextarea],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideCheck,
      lucideChevronDown,
      lucideCircleCheck,
      lucideExternalLink,
      lucideFileText,
      lucideHistory,
      lucideListChecks,
      lucideLock,
      lucideMessageSquare,
      lucideMessageSquarePlus,
      lucideUndo2,
    }),
  ],
  template: `
    <!-- Header -->
    <div hlmDialogHeader class="border-b border-border pb-4 pr-8">
      <p class="text-[11px] font-semibold uppercase tracking-wider text-primary">
        M{{ pad(ctx.index + 1) }} · Review{{ round > 1 ? ', round ' + round : '' }}
      </p>
      <h3 hlmDialogTitle class="text-lg leading-tight">{{ m.name }}</h3>
      <p hlmDialogDescription class="text-xs">
        {{ ctx.projectName }}
        @if (m.deliveredAt) { · Delivered {{ isoDay(m.deliveredAt) }} }
        @if (deliverables.length) { · {{ doneCount }} of {{ deliverables.length }} deliverables complete }
      </p>
    </div>

    @if (step() === 'done') {
      <div class="flex flex-col items-center gap-3 px-2 py-10 text-center">
        <div
          class="grid h-12 w-12 place-items-center rounded-full"
          [class]="result() === 'approved' ? 'bg-success/15 text-success' : 'bg-primary/12 text-primary'"
        >
          <ng-icon [name]="result() === 'approved' ? 'lucideCircleCheck' : 'lucideUndo2'" size="24" />
        </div>
        <div>
          <p class="text-sm font-semibold">
            {{ result() === 'approved' ? 'Milestone approved' : 'Changes requested' }}
          </p>
          <p class="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            @if (result() === 'approved') {
              Thanks - "{{ m.name }}" is signed off and the team has been told.
            } @else {
              Your {{ noteCount() }} {{ noteCount() === 1 ? 'note has' : 'notes have' }} gone to the team. They'll
              hand it over again for round {{ round + 1 }}.
            }
          </p>
        </div>
        <button hlmBtn size="sm" variant="outline" type="button" (click)="dialogRef.close(result() ?? undefined)">Done</button>
      </div>
    } @else {
      <div class="scrollbar-thin -mx-6 max-h-[62vh] min-h-0 overflow-y-auto px-6 py-5">
        <div class="space-y-7">
          <!-- 1. What was delivered -->
          <section aria-labelledby="rv-deliverables">
            <div class="mb-3 flex items-baseline justify-between gap-3">
              <h4 id="rv-deliverables" class="text-sm font-semibold">What was delivered</h4>
              @if (ctx.canApprove && step() === 'review') {
                <span class="text-[11px] text-muted-foreground">Add a note to anything that needs another look</span>
              }
            </div>
            @if (!deliverables.length) {
              <p class="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                No individual deliverables were listed - review the milestone as a whole below.
              </p>
            } @else {
              <ol class="divide-y divide-border overflow-hidden rounded-xl border border-border">
                @for (d of deliverables; track d.id; let i = $index) {
                  <li class="bg-card px-4 py-3.5" [class.bg-warning/5]="!!notes()[d.id]?.trim()">
                    <div class="flex items-start gap-3">
                      <span
                        class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
                        [class]="d.done ? 'bg-success text-white' : 'bg-muted text-muted-foreground'"
                        [attr.aria-label]="d.done ? 'Complete' : 'Not marked complete'"
                      >
                        @if (d.done) { <ng-icon name="lucideCheck" size="11" /> } @else { {{ i + 1 }} }
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium leading-5">{{ d.label }}</p>
                        @if (d.note) {
                          <p class="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">{{ d.note }}</p>
                        }
                        @if (d.links?.length || d.documentIds?.length) {
                          <div class="mt-2 flex flex-wrap gap-1.5">
                            @for (l of d.links ?? []; track $index) {
                              <a
                                [href]="l.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-medium hover:bg-muted hover:text-primary"
                              >
                                <ng-icon name="lucideExternalLink" size="11" class="shrink-0" />
                                <span class="truncate">{{ l.label || l.url }}</span>
                              </a>
                            }
                            @for (docId of d.documentIds ?? []; track docId) {
                              @if (ctx.documents.get(docId); as doc) {
                                <button
                                  type="button"
                                  (click)="download(doc)"
                                  class="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-medium hover:bg-muted hover:text-primary"
                                >
                                  <ng-icon name="lucideFileText" size="11" class="shrink-0" />
                                  <span class="truncate">{{ doc.name }}</span>
                                </button>
                              } @else {
                                <span class="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                                  <ng-icon name="lucideLock" size="11" /> File with the team
                                </span>
                              }
                            }
                          </div>
                        }

                        @if (ctx.canApprove && step() === 'review') {
                          @if (openNote() === d.id || notes()[d.id]) {
                            <textarea
                              hlmTextarea
                              rows="2"
                              class="mt-2.5 w-full text-sm"
                              [attr.aria-label]="'Feedback on ' + d.label"
                              placeholder="What needs to change?"
                              [value]="notes()[d.id] ?? ''"
                              (input)="setNote(d.id, $any($event.target).value)"
                            ></textarea>
                          } @else {
                            <button
                              type="button"
                              class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
                              (click)="openNote.set(d.id)"
                            >
                              <ng-icon name="lucideMessageSquarePlus" size="12" /> Add a note
                            </button>
                          }
                        } @else if (notes()[d.id]?.trim()) {
                          <p class="mt-2 flex gap-1.5 text-xs leading-5">
                            <ng-icon name="lucideMessageSquare" size="12" class="mt-1 shrink-0 text-warning" />
                            {{ notes()[d.id] }}
                          </p>
                        }
                      </div>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>

          <!-- 2. What "done" means -->
          <section aria-labelledby="rv-criteria">
            <div class="mb-3 flex items-baseline justify-between gap-3">
              <h4 id="rv-criteria" class="text-sm font-semibold">Acceptance criteria</h4>
              @if (criteria.length) {
                <span class="text-[11px] tabular-nums text-muted-foreground">
                  {{ checkedCount() }} of {{ criteria.length }} checked
                </span>
              }
            </div>
            @if (!criteria.length) {
              <p class="text-xs text-muted-foreground">No formal criteria were set for this milestone.</p>
            } @else {
              <ul class="space-y-1 rounded-xl border border-border bg-muted/20 p-2">
                @for (c of criteria; track $index; let ci = $index) {
                  <li class="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
                    <hlm-checkbox
                      class="mt-0.5"
                      [inputId]="'criterion-' + ci"
                      [checked]="checked().has(ci)"
                      [disabled]="!ctx.canApprove || step() !== 'review'"
                      (checkedChange)="toggleCriterion(ci, $event)"
                    />
                    <label
                      [for]="'criterion-' + ci"
                      class="flex-1 cursor-pointer text-sm leading-5"
                      [class.cursor-default]="!ctx.canApprove || step() !== 'review'"
                      [class.text-muted-foreground]="!checked().has(ci)"
                    >{{ c }}</label>
                  </li>
                }
              </ul>
            }
          </section>

          <!-- 3. Anything general -->
          @if (ctx.canApprove && step() === 'review') {
            <section aria-labelledby="rv-general">
              <h4 id="rv-general" class="mb-2 text-sm font-semibold">
                Overall feedback <span class="font-normal text-muted-foreground">(optional)</span>
              </h4>
              <textarea
                hlmTextarea
                rows="2"
                class="w-full text-sm"
                aria-labelledby="rv-general"
                placeholder="Anything about the milestone as a whole"
                [value]="general()"
                (input)="general.set($any($event.target).value)"
              ></textarea>
            </section>
          }

          <!-- 4. Earlier rounds -->
          @if (m.reviews.length) {
            <section aria-labelledby="rv-history">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 text-left"
                (click)="showHistory.update((v) => !v)"
                [attr.aria-expanded]="showHistory()"
              >
                <h4 id="rv-history" class="flex items-center gap-1.5 text-sm font-semibold">
                  <ng-icon name="lucideHistory" size="14" class="text-muted-foreground" />
                  Earlier rounds
                  <span class="font-normal text-muted-foreground">({{ m.reviews.length }})</span>
                </h4>
                <ng-icon name="lucideChevronDown" size="14" class="transition-transform" [class.rotate-180]="showHistory()" />
              </button>
              @if (showHistory()) {
                <ol class="mt-3 space-y-3 border-l border-border pl-4">
                  @for (r of m.reviews; track r.id) {
                    <li>
                      <p class="text-xs">
                        <span class="font-semibold">Round {{ r.round }}</span>
                        <span class="text-muted-foreground"> · {{ r.decision === 'approved' ? 'Approved' : 'Changes requested' }} by {{ r.reviewerName }} · {{ isoDay(r.createdAt) }}</span>
                      </p>
                      @for (c of r.comments; track $index) {
                        <p class="mt-1 text-xs leading-5 text-muted-foreground">
                          <span class="font-medium text-foreground">{{ labelFor(c.deliverableId) }}:</span> {{ c.body }}
                        </p>
                      }
                    </li>
                  }
                </ol>
              }
            </section>
          }
        </div>
      </div>

      <!-- Decision -->
      <div class="-mx-6 -mb-6 border-t border-border bg-muted/30 px-6 py-4">
        @if (!ctx.canApprove) {
          <p class="flex items-center gap-2 text-xs text-muted-foreground">
            <ng-icon name="lucideLock" size="13" />
            You can follow this review. Approving or requesting changes is done by your team's designated approver.
          </p>
        } @else {
          @switch (step()) {
            @case ('confirm-approve') {
              <p class="text-sm font-semibold">Approve "{{ m.name }}"?</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                This signs the milestone off on {{ ctx.projectName }}.
                @if (billing(); as b) {
                  The team will invoice <span class="font-medium text-foreground">{{ money(b.net, ctx.currency) }}</span>
                  (excl. tax){{ billingTail() }}.
                }
                @if (noteCount()) { Your {{ noteCount() === 1 ? 'note goes' : 'notes go' }} to the team with the approval. }
                It can't be undone from here.
              </p>
              @if (error()) { <p class="mt-2 break-words text-xs text-destructive">{{ error() }}</p> }
              <div class="mt-3 flex flex-wrap justify-end gap-2">
                <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="busy()" (click)="step.set('review')">Back</button>
                <button hlmBtn size="sm" type="button" class="gap-1.5" [disabled]="busy()" (click)="submit('approve')">
                  <ng-icon name="lucideBadgeCheck" size="14" />
                  {{ busy() ? 'Approving…' : 'Confirm approval' }}
                </button>
              </div>
            }
            @case ('confirm-changes') {
              <p class="text-sm font-semibold">Send {{ noteCount() }} {{ noteCount() === 1 ? 'note' : 'notes' }} and request changes?</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                "{{ m.name }}" goes back to the team with your feedback. They'll make the changes and hand it over again for round {{ round + 1 }}.
              </p>
              @if (error()) { <p class="mt-2 break-words text-xs text-destructive">{{ error() }}</p> }
              <div class="mt-3 flex flex-wrap justify-end gap-2">
                <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="busy()" (click)="step.set('review')">Back</button>
                <button hlmBtn size="sm" type="button" class="gap-1.5" [disabled]="busy()" (click)="submit('request_changes')">
                  <ng-icon name="lucideUndo2" size="14" />
                  {{ busy() ? 'Sending…' : 'Send feedback' }}
                </button>
              </div>
            }
            @default {
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-xs text-muted-foreground">
                  @if (noteCount()) {
                    {{ noteCount() }} {{ noteCount() === 1 ? 'note' : 'notes' }} ready to send
                  } @else if (criteria.length && !allChecked()) {
                    Check each criterion to approve
                  } @else {
                    Everything looks right?
                  }
                </p>
                <div class="flex flex-wrap gap-2">
                  <button
                    hlmBtn
                    variant="outline"
                    size="sm"
                    type="button"
                    class="gap-1.5"
                    [disabled]="!noteCount()"
                    [attr.title]="noteCount() ? null : 'Add a note first'"
                    (click)="step.set('confirm-changes')"
                  >
                    <ng-icon name="lucideUndo2" size="14" /> Request changes
                  </button>
                  <button
                    hlmBtn
                    size="sm"
                    type="button"
                    class="gap-1.5"
                    [disabled]="!allChecked()"
                    (click)="step.set('confirm-approve')"
                  >
                    <ng-icon name="lucideBadgeCheck" size="14" /> Approve milestone
                  </button>
                </div>
              </div>
            }
          }
        }
      </div>
    }
  `,
})
export class MilestoneReviewDialog {
  protected readonly dialogRef = inject<BrnDialogRef<MilestoneReviewResult | undefined>>(BrnDialogRef);
  protected readonly ctx = injectBrnDialogContext<MilestoneReviewContext>();
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly documentsApi = inject(DocumentsApiService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;

  protected readonly m = this.ctx.milestone;
  protected readonly deliverables = this.m.deliverables ?? [];
  protected readonly doneCount = this.deliverables.filter((d) => d.done).length;
  /** This hand-over's round number. */
  protected readonly round = (this.m.reviews?.length ?? 0) + 1;
  /** Acceptance criteria as a checklist: one line each, bullets/numbers stripped. */
  protected readonly criteria = (this.m.acceptanceCriteria ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

  protected readonly step = signal<Step>('review');
  protected readonly result = signal<MilestoneReviewResult | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showHistory = signal(false);
  protected readonly openNote = signal<string | null>(null);
  /** Feedback per deliverable id. */
  protected readonly notes = signal<Record<string, string>>({});
  protected readonly general = signal('');
  protected readonly checked = signal<ReadonlySet<number>>(new Set());

  protected readonly checkedCount = computed(() => this.checked().size);
  protected readonly allChecked = computed(
    () => this.checked().size === this.criteria.length,
  );
  protected readonly noteCount = computed(
    () =>
      Object.values(this.notes()).filter((n) => n.trim()).length +
      (this.general().trim() ? 1 : 0),
  );

  /** What approving bills (only when the portal shows prices). */
  protected readonly billing = computed(() => {
    const amount = num(this.m.amount);
    if (!amount || this.m.billingTrigger !== 'on_acceptance') return null;
    const retained = this.m.releasesRetention
      ? 0
      : Math.round(amount * this.ctx.retentionPercent) / 100;
    return { net: amount - retained, retained };
  });

  /** ", holding 10% (KES 20,000) until the final milestone" etc. - joined here so punctuation stays tight. */
  protected readonly billingTail = computed(() => {
    const b = this.billing();
    if (!b) return '';
    if (b.retained > 0) {
      return `, holding ${this.ctx.retentionPercent}% (${money(b.retained, this.ctx.currency)}) until the final milestone`;
    }
    if (this.m.releasesRetention && this.ctx.retentionPercent > 0) {
      return ', plus the retention held on earlier milestones';
    }
    return '';
  });

  protected setNote(id: string, value: string): void {
    this.notes.update((n) => ({ ...n, [id]: value }));
  }

  protected toggleCriterion(i: number, on: boolean): void {
    this.checked.update((s) => {
      const next = new Set(s);
      if (on) next.add(i);
      else next.delete(i);
      return next;
    });
  }

  protected labelFor(deliverableId: string | null): string {
    if (!deliverableId) return 'Overall';
    return this.deliverables.find((d) => d.id === deliverableId)?.label ?? 'A deliverable';
  }

  protected download(doc: { id: string; name: string }): void {
    this.documentsApi.download(doc.id).subscribe((blob) => saveBlob(blob, doc.name));
  }

  protected submit(decision: 'approve' | 'request_changes'): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const comments = [
      ...Object.entries(this.notes())
        .filter(([, body]) => body.trim())
        .map(([deliverableId, body]) => ({ deliverableId, body: body.trim() })),
      ...(this.general().trim() ? [{ deliverableId: null, body: this.general().trim() }] : []),
    ];
    this.projectsApi
      .reviewMilestone(this.ctx.projectId, this.m.id, {
        decision,
        comments,
        criteriaConfirmed: decision === 'approve' ? this.allChecked() : undefined,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.result.set(decision === 'approve' ? 'approved' : 'changes_requested');
          this.step.set('done');
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(err));
        },
      });
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
