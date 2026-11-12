import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideEllipsis,
  lucideFlag,
  lucideGripVertical,
  lucideList,
  lucideLock,
  lucidePlus,
  lucideReceipt,
  lucideRepeat,
  lucideSparkles,
  lucideTrash2,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Currency, money, newId } from '@foundry/shared-util';
import { QuoteDeliverable, QuoteItemKind } from '../../domains/quotes';
import { lineKey } from './quote-validation';

/** Editable quote line; ids are local until the API replaces them on save. */
export interface QuoteLineDraft {
  id: string;
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  rate: number;
  /** Client-facing scope (milestones and options - both become milestones). */
  details: string;
  estimatedHours: number | null;
  /** What will be handed over; becomes the milestone's checklist. */
  deliverables: QuoteDeliverable[];
  /** What the client checks before signing off. */
  acceptanceCriteria: string;
  /** Options only. */
  selected: boolean;
}

/** Lines that become project milestones, so carry scope. */
export const isScoped = (kind: QuoteItemKind) =>
  kind === 'milestone' || kind === 'option';

/** Whether any scope has been written for a line. */
export const hasScope = (it: QuoteLineDraft) =>
  !!(
    it.details.trim() ||
    it.estimatedHours ||
    it.deliverables.length ||
    it.acceptanceCriteria.trim()
  );

interface SectionMeta {
  kind: QuoteItemKind;
  title: string;
  hint: string;
  icon: string;
  /** Label on the "add" chip. */
  add: string;
  placeholder: string;
  suffix?: string;
}

/** Display (and save) order of the quote's sections. */
export const QUOTE_SECTIONS: SectionMeta[] = [
  {
    kind: 'milestone',
    title: 'Milestones',
    hint: 'Fixed-price deliverables. Each becomes a project milestone, invoiced on sign-off.',
    icon: 'lucideFlag',
    add: 'Milestone',
    placeholder: 'M01 Technical assessment and scope',
  },
  {
    kind: 'standard',
    title: 'Line items',
    hint: 'One-off charges.',
    icon: 'lucideList',
    add: 'Line item',
    placeholder: 'Design sprint - week 3',
  },
  {
    kind: 'option',
    title: 'Options',
    hint: 'Add-ons the client can pick. Counted only when included.',
    icon: 'lucideSparkles',
    add: 'Option',
    placeholder: 'iOS app',
  },
  {
    kind: 'recurring',
    title: 'Recurring',
    hint: 'Monthly charges, quoted alongside the total.',
    icon: 'lucideRepeat',
    add: 'Monthly',
    placeholder: 'Maintenance retainer - Standard',
    suffix: '/mo',
  },
  {
    kind: 'pass_through',
    title: 'Pass-through costs',
    hint: 'Third-party costs billed at cost. An estimate, not in the total.',
    icon: 'lucideReceipt',
    add: 'At-cost item',
    placeholder: 'Hosting and store fees',
  },
];

const sectionIndex = (kind: QuoteItemKind) =>
  QUOTE_SECTIONS.findIndex((s) => s.kind === kind);

/** Stable sort into section order - what the editor shows and what gets saved. */
export function sortBySection(items: QuoteLineDraft[]): QuoteLineDraft[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort(
      (a, b) =>
        sectionIndex(a.it.kind) - sectionIndex(b.it.kind) || a.i - b.i,
    )
    .map(({ it }) => it);
}

export const emptyQuoteLine = (kind: QuoteItemKind): QuoteLineDraft => ({
  id: newId(),
  kind,
  description: '',
  quantity: 1,
  rate: 0,
  details: '',
  estimatedHours: null,
  deliverables: [],
  acceptanceCriteria: '',
  selected: false,
});

/**
 * Quote lines grouped by kind: each section carries its own subtotal, rows
 * reorder by drag within a section, and a row can be moved to another
 * section from its menu. Milestone and option rows expand to client-facing
 * scope - summary, deliverables, acceptance criteria and an hours estimate -
 * which is exactly what the generated project milestone will carry and the
 * client will later sign off against.
 */
@Component({
  selector: 'app-quote-lines-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmCheckboxImports,
    HlmDropdownMenuImports,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideChevronDown,
      lucideEllipsis,
      lucideFlag,
      lucideGripVertical,
      lucideList,
      lucideLock,
      lucidePlus,
      lucideReceipt,
      lucideRepeat,
      lucideSparkles,
      lucideTrash2,
      lucideX,
    }),
  ],
  template: `
    <div class="space-y-8">
      @if (items().length === 0) {
        <div
          class="rounded-xl border border-dashed px-4 py-10 text-center"
          [class.border-border]="!errors()['items']"
          [class.border-destructive]="!!errors()['items']"
          data-issue="items"
          tabindex="-1"
        >
          <p class="text-sm font-medium">Start with what you're quoting</p>
          <p class="mt-1 text-xs text-muted-foreground">
            Milestones become the project plan and billing schedule once the
            quote is accepted.
          </p>
          @if (errors()['items']; as e) {
            <p class="mt-2 text-xs font-medium text-destructive" role="alert">{{ e }}</p>
          }
        </div>
      }

      @for (sec of visibleSections(); track sec.kind; let first = $first) {
        <section>
          <header class="flex items-center gap-2 border-b border-border pb-2">
            <ng-icon [name]="sec.icon" size="13" class="shrink-0 text-muted-foreground" />
            <p class="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {{ sec.title }}
              <span class="ml-0.5 font-normal tabular-nums">{{ rowsOf(sec.kind).length }}</span>
            </p>
            <p class="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70 md:block">
              {{ sec.hint }}
            </p>
            <span class="ml-auto shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {{ fmt(subtotal(sec.kind)) }}{{ sec.suffix ?? '' }}
            </span>
          </header>
          @if (first) {
            <div
              class="hidden grid-cols-[28px_1fr_60px_96px_104px_28px] gap-1.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 sm:grid"
            >
              <span></span>
              <span class="px-2">Description</span>
              <span class="px-2 text-right">Qty</span>
              <span class="px-2 text-right">Rate</span>
              <span class="pr-1 text-right">Amount</span>
              <span></span>
            </div>
          }

          <div
            cdkDropList
            [cdkDropListDisabled]="locked()"
            (cdkDropListDropped)="drop(sec.kind, $event)"
            class="divide-y divide-border"
          >
            @for (it of rowsOf(sec.kind); track it.id; let i = $index) {
              <div
                cdkDrag
                [cdkDragData]="it"
                [attr.data-line]="it.id"
                class="bg-background py-1.5"
              >
                <div
                  class="grid grid-cols-[28px_1fr_28px] items-center gap-1.5 sm:grid-cols-[28px_1fr_60px_96px_104px_28px]"
                >
                  <!-- lead slot: milestone number / option tick / drag handle -->
                  <span class="flex items-center justify-center">
                    @if (sec.kind === 'option') {
                      <hlm-checkbox
                        [checked]="it.selected"
                        [disabled]="locked()"
                        (checkedChange)="update(it.id, { selected: $event })"
                        [attr.aria-label]="'Include ' + (it.description || 'option')"
                      />
                    } @else if (sec.kind === 'milestone') {
                      <button
                        type="button"
                        cdkDragHandle
                        [cdkDragHandleDisabled]="locked()"
                        class="rounded px-1 font-mono text-[10px] font-semibold text-primary"
                        [class.cursor-grab]="!locked()"
                        [attr.aria-label]="'Reorder milestone ' + (i + 1)"
                      >
                        M{{ pad(i + 1) }}
                      </button>
                    } @else {
                      <button
                        type="button"
                        cdkDragHandle
                        [cdkDragHandleDisabled]="locked()"
                        class="text-muted-foreground hover:text-foreground"
                        [class.cursor-grab]="!locked()"
                        aria-label="Reorder line"
                      >
                        <ng-icon name="lucideGripVertical" size="14" />
                      </button>
                    }
                  </span>

                  <input
                    hlmInput
                    [value]="it.description"
                    [readOnly]="locked()"
                    (input)="update(it.id, { description: $any($event.target).value })"
                    (keydown.enter)="$event.preventDefault(); addAfter(it)"
                    (blur)="touch(it.id, 'description')"
                    [forceInvalid]="!!err(it.id, 'description')"
                    [attr.aria-invalid]="!!err(it.id, 'description')"
                    [attr.data-issue]="key(it.id, 'description')"
                    [placeholder]="sec.placeholder"
                    class="h-8 w-full border-0 bg-transparent px-2 text-sm font-medium shadow-none hover:bg-muted/40 focus-visible:bg-muted/60"
                    [class.line-through]="sec.kind === 'option' && !it.selected"
                    [class.text-muted-foreground]="sec.kind === 'option' && !it.selected"
                    aria-label="Description"
                  />

                  <div
                    class="col-span-3 grid grid-cols-[28px_60px_96px_1fr] items-center gap-1.5 sm:contents"
                  >
                    <span class="sm:hidden"></span>
                    <input
                      hlmInput
                      type="number"
                      min="0"
                      step="0.01"
                      [value]="it.quantity"
                      [readOnly]="locked()"
                      (input)="update(it.id, { quantity: toNumber($event) })"
                      (blur)="touch(it.id, 'quantity')"
                      [forceInvalid]="!!err(it.id, 'quantity')"
                      [attr.aria-invalid]="!!err(it.id, 'quantity')"
                      [attr.data-issue]="key(it.id, 'quantity')"
                      class="h-8 w-full border-0 bg-transparent px-2 text-right tabular-nums shadow-none hover:bg-muted/40 focus-visible:bg-muted/60"
                      aria-label="Quantity"
                    />
                    <input
                      hlmInput
                      type="number"
                      min="0"
                      step="0.01"
                      [value]="it.rate"
                      [readOnly]="locked()"
                      (input)="update(it.id, { rate: toNumber($event) })"
                      (blur)="touch(it.id, 'rate')"
                      [forceInvalid]="!!err(it.id, 'rate')"
                      [attr.aria-invalid]="!!err(it.id, 'rate')"
                      [attr.data-issue]="key(it.id, 'rate')"
                      class="h-8 w-full border-0 bg-transparent px-2 text-right tabular-nums shadow-none hover:bg-muted/40 focus-visible:bg-muted/60"
                      aria-label="Rate"
                    />
                    <span
                      class="pr-1 text-right text-sm font-semibold tabular-nums"
                      [class.text-muted-foreground]="sec.kind === 'option' && !it.selected"
                    >
                      {{ fmt(it.quantity * it.rate) }}{{ sec.suffix ?? '' }}
                    </span>
                  </div>
                  <span class="col-start-3 row-start-1 flex justify-end sm:col-auto sm:row-auto">
                    @if (!locked()) {
                      <button
                        type="button"
                        [hlmDropdownMenuTrigger]="rowMenu"
                        [hlmDropdownMenuTriggerData]="{ $implicit: it }"
                        align="end"
                        class="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Line actions"
                      >
                        <ng-icon name="lucideEllipsis" size="15" />
                      </button>
                    }
                  </span>

                </div>
                @if (rowMessage(it); as msg) {
                  <p
                    class="flex items-start gap-1 pb-1 pl-[34px] pt-0.5 text-[11px] leading-snug"
                    [class.text-destructive]="msg.error"
                    [class.text-warning]="!msg.error"
                    [attr.role]="msg.error ? 'alert' : null"
                  >
                    {{ msg.text }}
                  </p>
                }

                @if (isScoped(sec.kind) && (!locked() || hasScope(it))) {
                  <div class="pl-[34px]">
                    @if (isExpanded(it)) {
                      <div class="space-y-3 pb-2 pt-1">
                        <div class="grid gap-2 sm:grid-cols-[1fr_96px]">
                          <label class="grid gap-1">
                            <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                              >Summary</span
                            >
                            <textarea
                              hlmTextarea
                              rows="2"
                              class="min-h-0 w-full text-xs"
                              [value]="it.details"
                              [readOnly]="locked()"
                              (input)="update(it.id, { details: $any($event.target).value })"
                              (blur)="touch(it.id, 'details')"
                              [forceInvalid]="!!err(it.id, 'details')"
                              [attr.data-issue]="key(it.id, 'details')"
                              placeholder="What this milestone covers, as the client will read it"
                            ></textarea>
                            @if (err(it.id, 'details'); as e) {
                              <span class="text-[11px] text-destructive" role="alert">{{ e }}</span>
                            }
                          </label>
                          <label class="grid content-start gap-1">
                            <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                              >Est. hours</span
                            >
                            <input
                              hlmInput
                              type="number"
                              min="0"
                              step="1"
                              class="h-8 w-full text-right"
                              [value]="it.estimatedHours ?? ''"
                              [readOnly]="locked()"
                              (input)="update(it.id, { estimatedHours: toHours($event) })"
                            />
                          </label>
                        </div>

                        <div class="grid gap-1">
                          <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Deliverables
                            <span class="ml-1 normal-case tracking-normal">
                              - the checklist the client signs off
                            </span>
                          </span>
                          @if (it.deliverables.length) {
                            <ul class="grid gap-0.5">
                              @for (d of it.deliverables; track d.id) {
                                <li class="group/d flex items-center gap-1.5">
                                  <ng-icon
                                    name="lucideCheck"
                                    size="12"
                                    class="shrink-0 text-muted-foreground"
                                  />
                                  <input
                                    hlmInput
                                    [value]="d.label"
                                    [readOnly]="locked()"
                                    (input)="renameDeliverable(it, d.id, $any($event.target).value)"
                                    (blur)="pruneDeliverables(it)"
                                    maxlength="500"
                                    class="h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:bg-muted/60"
                                    aria-label="Deliverable"
                                  />
                                  @if (!locked()) {
                                    <button
                                      type="button"
                                      class="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 sm:opacity-0 sm:group-hover/d:opacity-100 sm:focus-visible:opacity-100"
                                      (click)="removeDeliverable(it, d.id)"
                                      [attr.aria-label]="'Remove ' + (d.label || 'deliverable')"
                                    >
                                      <ng-icon name="lucideX" size="12" />
                                    </button>
                                  }
                                </li>
                              }
                            </ul>
                          }
                          @if (!locked()) {
                            <input
                              #newDeliverable
                              hlmInput
                              class="h-8 w-full text-xs"
                              placeholder="Add a deliverable and press Enter - paste a list to add several"
                              (keydown.enter)="
                                $event.preventDefault();
                                addDeliverables(it, newDeliverable.value);
                                newDeliverable.value = ''
                              "
                              (paste)="onDeliverablePaste(it, $event, newDeliverable)"
                              [forceInvalid]="!!err(it.id, 'deliverables')"
                              [attr.data-issue]="key(it.id, 'deliverables')"
                              aria-label="New deliverable"
                            />
                          }
                          @if (err(it.id, 'deliverables'); as e) {
                            <span class="text-[11px] text-destructive" role="alert">{{ e }}</span>
                          }
                        </div>

                        <label class="grid gap-1">
                          <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                            >Accepted when</span
                          >
                          <textarea
                            hlmTextarea
                            rows="2"
                            class="min-h-0 w-full text-xs"
                            [value]="it.acceptanceCriteria"
                            [readOnly]="locked()"
                            (input)="update(it.id, { acceptanceCriteria: $any($event.target).value })"
                            (blur)="touch(it.id, 'acceptanceCriteria')"
                            [forceInvalid]="!!err(it.id, 'acceptanceCriteria')"
                            [attr.data-issue]="key(it.id, 'acceptanceCriteria')"
                            placeholder="e.g. The app installs on two agreed Android phones and a user can sign in"
                          ></textarea>
                          @if (err(it.id, 'acceptanceCriteria'); as e) {
                            <span class="text-[11px] text-destructive" role="alert">{{ e }}</span>
                          }
                        </label>
                      </div>
                    }
                    <button
                      type="button"
                      class="mb-0.5 inline-flex items-center gap-1 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground"
                      [attr.aria-expanded]="isExpanded(it)"
                      (click)="toggle(it.id)"
                    >
                      <ng-icon
                        name="lucideChevronDown"
                        size="12"
                        class="transition-transform"
                        [class.-rotate-90]="!isExpanded(it)"
                      />
                      @if (isExpanded(it)) {
                        Hide scope
                      } @else {
                        @if (scopeError(it); as e) {
                          <span class="text-destructive">{{ e }}</span>
                        } @else {
                          <span [class.text-warning]="needsScope(it)">{{ milestoneSummary(it) }}</span>
                        }
                      }
                    </button>
                  </div>
                }
              </div>
            }
          </div>

          @if (!locked()) {
            <button
              hlmBtn
              type="button"
              variant="ghost"
              size="sm"
              (click)="add(sec.kind)"
              class="h-8 w-full justify-start gap-1.5 rounded-none border-0 border-t border-border px-2 text-xs text-muted-foreground shadow-none hover:text-foreground"
            >
              <ng-icon name="lucidePlus" size="13" />
              Add {{ sec.add.toLowerCase() }}
            </button>
          }
        </section>
      }

      @if (locked()) {
        <p class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ng-icon name="lucideLock" size="12" />
          {{ lockNote() || 'Lines are locked.' }}
        </p>
      } @else {
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="mr-1 text-[11px] text-muted-foreground">Add</span>
          @for (sec of sections; track sec.kind) {
            <button
              type="button"
              (click)="add(sec.kind)"
              class="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <ng-icon [name]="sec.icon" size="12" />
              {{ sec.add }}
            </button>
          }
        </div>
      }
    </div>

    <ng-template #rowMenu let-it>
      <hlm-dropdown-menu class="w-48">
        <p class="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">Move to</p>
        @for (sec of sections; track sec.kind) {
          @if (sec.kind !== it.kind) {
            <button hlmDropdownMenuItem (triggered)="moveTo(it.id, sec.kind)">
              <ng-icon [name]="sec.icon" size="14" />
              {{ sec.title }}
            </button>
          }
        }
        <hlm-dropdown-menu-separator />
        <button hlmDropdownMenuItem variant="destructive" (triggered)="remove(it.id)">
          <ng-icon name="lucideTrash2" size="14" />
          Remove line
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class QuoteLinesEditor {
  readonly items = input.required<QuoteLineDraft[]>();
  readonly currency = input<Currency>('USD');
  /** Read-only view (converted quote). */
  readonly locked = input(false);
  /** Shown under the locked editor - why it can't be edited. */
  readonly lockNote = input('');
  /** Problems to show, keyed `line:<id>:<field>` (see quote-validation). */
  readonly errors = input<Record<string, string>>({});
  /** Non-blocking advice, keyed like errors. */
  readonly warnings = input<Record<string, string>>({});
  readonly itemsChange = output<QuoteLineDraft[]>();
  /** A line field lost focus - the editor starts showing its problems. */
  readonly touched = output<string>();

  protected readonly sections = QUOTE_SECTIONS;
  protected readonly isScoped = isScoped;
  protected readonly hasScope = hasScope;
  protected readonly visibleSections = computed(() => {
    const kinds = new Set(this.items().map((it) => it.kind));
    return QUOTE_SECTIONS.filter((s) => kinds.has(s.kind));
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The one row whose scope panel is open (accordion); new milestones open. */
  private readonly expanded = signal<string | null>(null);

  protected key(lineId: string, field: string): string {
    return lineKey(lineId, field);
  }

  protected err(lineId: string, field: string): string {
    return this.errors()[lineKey(lineId, field)] ?? '';
  }

  protected touch(lineId: string, field: string): void {
    this.touched.emit(lineKey(lineId, field));
  }

  /** The row's own message: its first problem, else advice about it. */
  protected rowMessage(it: QuoteLineDraft): { text: string; error: boolean } | null {
    for (const field of ['description', 'quantity', 'rate']) {
      const e = this.err(it.id, field);
      if (e) return { text: e, error: true };
    }
    const w = this.locked() ? '' : this.warnings()[lineKey(it.id, 'rate')];
    return w ? { text: w, error: false } : null;
  }

  /** A problem inside the (collapsed) scope panel. */
  protected scopeError(it: QuoteLineDraft): string {
    const e =
      this.err(it.id, 'details') ||
      this.err(it.id, 'deliverables') ||
      this.err(it.id, 'acceptanceCriteria');
    return e ? `Scope needs attention: ${e.charAt(0).toLowerCase()}${e.slice(1)}` : '';
  }

  /**
   * Brings a line's field into view and focus - opening its scope panel
   * first when the field lives there.
   */
  reveal(lineId: string, field: string): void {
    if (['details', 'deliverables', 'acceptanceCriteria'].includes(field)) {
      this.expanded.set(lineId);
    }
    afterNextRender(
      () => {
        const el = this.host.nativeElement.querySelector<HTMLElement>(
          `[data-issue="${lineKey(lineId, field)}"]`,
        );
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  protected rowsOf(kind: QuoteItemKind): QuoteLineDraft[] {
    return this.items().filter((it) => it.kind === kind);
  }

  protected subtotal(kind: QuoteItemKind): number {
    return this.rowsOf(kind)
      .filter((it) => kind !== 'option' || it.selected)
      .reduce((s, it) => s + it.quantity * it.rate, 0);
  }

  protected update(id: string, patch: Partial<QuoteLineDraft>): void {
    this.itemsChange.emit(
      this.items().map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }

  protected add(kind: QuoteItemKind): void {
    this.insert(emptyQuoteLine(kind), this.items().length);
  }

  /** Enter in a description: a new line of the same kind right below it. */
  protected addAfter(it: QuoteLineDraft): void {
    if (this.locked()) return;
    const at = this.items().findIndex((x) => x.id === it.id) + 1;
    this.insert(emptyQuoteLine(it.kind), at);
  }

  private insert(line: QuoteLineDraft, at: number): void {
    // Options stay collapsed: their scope matters only if the client picks them.
    if (line.kind === 'milestone') this.expanded.set(line.id);
    const items = [...this.items()];
    items.splice(at, 0, line);
    this.itemsChange.emit(sortBySection(items));
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLInputElement>(
            `[data-line="${line.id}"] input[aria-label="Description"]`,
          )
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected remove(id: string): void {
    this.itemsChange.emit(this.items().filter((it) => it.id !== id));
  }

  /** Moves a line to the end of another section. */
  protected moveTo(id: string, kind: QuoteItemKind): void {
    const line = this.items().find((it) => it.id === id);
    if (!line) return;
    const rest = this.items().filter((it) => it.id !== id);
    this.itemsChange.emit(
      sortBySection([...rest, { ...line, kind, selected: kind === 'option' }]),
    );
  }

  protected drop(kind: QuoteItemKind, event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    const rows = this.rowsOf(kind);
    moveItemInArray(rows, event.previousIndex, event.currentIndex);
    const others = this.items().filter((it) => it.kind !== kind);
    this.itemsChange.emit(sortBySection([...others, ...rows]));
  }

  protected isExpanded(it: QuoteLineDraft): boolean {
    return this.expanded() === it.id;
  }

  protected toggle(id: string): void {
    this.expanded.update((open) => (open === id ? null : id));
  }

  /** Collapsed-row chip: what's written so far, or a prompt to add it. */
  protected milestoneSummary(it: QuoteLineDraft): string {
    if (!hasScope(it)) {
      return it.kind === 'option' ? 'Add scope (used if picked)' : 'Add scope';
    }
    const n = it.deliverables.length;
    const parts = [
      n ? `${n} deliverable${n === 1 ? '' : 's'}` : 'No deliverables',
      it.acceptanceCriteria.trim() ? 'criteria set' : 'no criteria',
      it.estimatedHours ? `${it.estimatedHours}h` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }

  /**
   * A milestone line with nothing for the client to sign off against.
   * Flagged, not blocked: a quick quote stays quick.
   */
  protected needsScope(it: QuoteLineDraft): boolean {
    return (
      it.kind === 'milestone' &&
      !this.locked() &&
      !it.deliverables.length &&
      !it.acceptanceCriteria.trim()
    );
  }

  /** One deliverable per non-empty line; bullets and numbering stripped. */
  protected addDeliverables(it: QuoteLineDraft, text: string): void {
    const labels = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    if (!labels.length) return;
    this.update(it.id, {
      deliverables: [
        ...it.deliverables,
        ...labels.map((label) => ({ id: newId(), label })),
      ],
    });
  }

  /** A multi-line paste becomes several deliverables; a single line pastes normally. */
  protected onDeliverablePaste(
    it: QuoteLineDraft,
    event: ClipboardEvent,
    field: HTMLInputElement,
  ): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!/\r?\n/.test(text.trim())) return;
    event.preventDefault();
    this.addDeliverables(it, text);
    field.value = '';
  }

  protected renameDeliverable(it: QuoteLineDraft, id: string, label: string): void {
    this.update(it.id, {
      deliverables: it.deliverables.map((d) => (d.id === id ? { ...d, label } : d)),
    });
  }

  /** Clearing a deliverable's text removes it once the field loses focus. */
  protected pruneDeliverables(it: QuoteLineDraft): void {
    const current = this.items().find((x) => x.id === it.id);
    if (current?.deliverables.some((d) => !d.label.trim())) {
      this.update(it.id, {
        deliverables: current.deliverables.filter((d) => d.label.trim()),
      });
    }
  }

  protected removeDeliverable(it: QuoteLineDraft, id: string): void {
    this.update(it.id, {
      deliverables: it.deliverables.filter((d) => d.id !== id),
    });
  }

  protected fmt(n: number): string {
    return money(n, this.currency());
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected toNumber(event: Event): number {
    return Number((event.target as HTMLInputElement).value) || 0;
  }

  protected toHours(event: Event): number | null {
    const v = (event.target as HTMLInputElement).value;
    return v === '' ? null : Math.max(0, Math.round(Number(v) || 0));
  }
}
