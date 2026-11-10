import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Currency, money, newId } from '@foundry/shared-util';
import { QuoteItemKind } from '../../domains/quotes';

/** Editable quote line; ids are local until the API replaces them on save. */
export interface QuoteLineDraft {
  id: string;
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  rate: number;
  /** Client-facing scope (milestones). */
  details: string;
  estimatedHours: number | null;
  /** Options only. */
  selected: boolean;
}

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
  selected: false,
});

/**
 * Quote lines grouped by kind: each section carries its own subtotal, rows
 * reorder by drag within a section, and a row can be moved to another
 * section from its menu. Milestone rows expand to client-facing scope and an
 * hours estimate - what the generated project milestone will carry.
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
    }),
  ],
  template: `
    <div class="space-y-3">
      @if (items().length === 0) {
        <div
          class="rounded-lg border border-dashed border-border px-4 py-6 text-center"
        >
          <p class="text-sm font-medium">Start with what you're quoting</p>
          <p class="mt-1 text-xs text-muted-foreground">
            Milestones become the project plan and billing schedule once the
            quote is accepted.
          </p>
        </div>
      }

      @for (sec of visibleSections(); track sec.kind) {
        <section class="overflow-hidden rounded-lg border border-border">
          <header
            class="flex items-center gap-2.5 border-b border-border bg-muted/40 px-3 py-2"
          >
            <span
              class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-background text-muted-foreground ring-1 ring-border"
            >
              <ng-icon [name]="sec.icon" size="13" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold">
                {{ sec.title }}
                <span class="ml-1 font-normal text-muted-foreground">{{
                  rowsOf(sec.kind).length
                }}</span>
              </p>
              <p class="hidden truncate text-[11px] text-muted-foreground sm:block">
                {{ sec.hint }}
              </p>
            </div>
            <span class="text-xs font-semibold tabular-nums">
              {{ fmt(subtotal(sec.kind)) }}{{ sec.suffix ?? '' }}
            </span>
          </header>

          <div
            cdkDropList
            [cdkDropListDisabled]="locked()"
            (cdkDropListDropped)="drop(sec.kind, $event)"
            class="divide-y divide-border"
          >
            @for (it of rowsOf(sec.kind); track it.id; let i = $index) {
              <div cdkDrag [cdkDragData]="it" class="bg-card px-2 py-1.5 sm:px-3">
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
                    [placeholder]="sec.placeholder"
                    class="h-8 w-full border-0 bg-transparent px-2 shadow-none focus-visible:bg-muted/60"
                    [class.line-through]="sec.kind === 'option' && !it.selected"
                    [class.text-muted-foreground]="sec.kind === 'option' && !it.selected"
                    aria-label="Description"
                  />

                  <span class="flex justify-end sm:order-last">
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
                      class="h-8 w-full border-0 bg-transparent px-2 text-right shadow-none focus-visible:bg-muted/60"
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
                      class="h-8 w-full border-0 bg-transparent px-2 text-right shadow-none focus-visible:bg-muted/60"
                      aria-label="Rate"
                    />
                    <span
                      class="pr-1 text-right text-sm font-semibold tabular-nums"
                      [class.text-muted-foreground]="sec.kind === 'option' && !it.selected"
                    >
                      {{ fmt(it.quantity * it.rate) }}{{ sec.suffix ?? '' }}
                    </span>
                  </div>
                </div>

                @if (
                  sec.kind === 'milestone' &&
                  (!locked() || it.details.trim() || it.estimatedHours)
                ) {
                  <div class="pl-[34px]">
                    @if (isExpanded(it)) {
                      <div class="grid gap-2 pb-1.5 pt-1 sm:grid-cols-[1fr_96px]">
                        <textarea
                          hlmTextarea
                          rows="2"
                          class="min-h-0 w-full text-xs"
                          [value]="it.details"
                          [readOnly]="locked()"
                          (input)="update(it.id, { details: $any($event.target).value })"
                          placeholder="Scope and deliverables, as the client will read them"
                          aria-label="Milestone scope"
                        ></textarea>
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
                    }
                    <button
                      type="button"
                      class="mb-0.5 inline-flex items-center gap-1 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground"
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
                        {{ milestoneSummary(it) }}
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
              class="h-8 w-full justify-start gap-1.5 rounded-none border-t border-border text-xs text-muted-foreground hover:text-foreground"
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
  readonly itemsChange = output<QuoteLineDraft[]>();

  protected readonly sections = QUOTE_SECTIONS;
  protected readonly visibleSections = computed(() => {
    const kinds = new Set(this.items().map((it) => it.kind));
    return QUOTE_SECTIONS.filter((s) => kinds.has(s.kind));
  });

  /** Rows whose scope panel is open; new milestone rows open by default. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

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
    const line = emptyQuoteLine(kind);
    if (kind === 'milestone') {
      this.expanded.update((s) => new Set(s).add(line.id));
    }
    this.itemsChange.emit(sortBySection([...this.items(), line]));
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
    return this.expanded().has(it.id);
  }

  protected toggle(id: string): void {
    this.expanded.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected milestoneSummary(it: QuoteLineDraft): string {
    const parts = [
      it.details.trim() ? 'Scope added' : 'Add scope',
      it.estimatedHours ? `${it.estimatedHours}h` : '',
    ].filter(Boolean);
    return parts.join(' · ');
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
