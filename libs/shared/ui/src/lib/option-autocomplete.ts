import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  model,
  untracked,
  viewChild,
} from '@angular/core';
import { BrnAutocomplete } from '@spartan-ng/brain/autocomplete';
import { HlmAutocompleteImports } from '@spartan-ng/helm/autocomplete';

export interface AutocompleteOption {
  value: string;
  label: string;
  /** Short code shown before the label and matched first ('KES'). */
  code?: string;
  /** Muted secondary text after the label; also searched. */
  hint?: string;
}

const text = (o: AutocompleteOption) =>
  o.code ? `${o.code} - ${o.label}` : o.label;

function search(
  options: readonly AutocompleteOption[],
  term: string,
): readonly AutocompleteOption[] {
  const q = term.trim().toLowerCase();
  if (!q) return options;
  const starts: AutocompleteOption[] = [];
  const contains: AutocompleteOption[] = [];
  for (const o of options) {
    const code = o.code?.toLowerCase() ?? '';
    const label = o.label.toLowerCase();
    if (code.startsWith(q) || label.startsWith(q)) starts.push(o);
    else if (
      code.includes(q) ||
      label.includes(q) ||
      o.hint?.toLowerCase().includes(q)
    )
      contains.push(o);
  }
  return [...starts, ...contains];
}

/**
 * Type-to-search single-value picker over a fixed option list, built on
 * HlmAutocomplete. A signal-forms value control (`[formField]`) as well as a
 * plain `[(value)]` one; the value is the chosen option's `value` string.
 *
 * The field always holds one of its options, so clearing the text never
 * clears the value - it snaps back to the selection when the list closes.
 * An "empty" choice ("All clients", "Not linked") is just another option,
 * e.g. `{ value: '', label: 'Not linked' }`.
 */
@Component({
  selector: 'app-option-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [HlmAutocompleteImports],
  template: `
    <hlm-autocomplete
      class="w-full"
      [value]="selected()"
      [search]="search()"
      [disabled]="disabled()"
      [itemToString]="text"
      [isItemEqualToValue]="sameOption"
      (searchChange)="search.set($event)"
      (valueChange)="pick($event)"
      (closed)="restore()"
      (focusin)="onFocus($event)"
      (focusout)="onFocusOut()"
      (click)="onClick($event)"
    >
      <hlm-autocomplete-input
        class="w-full"
        [showSearch]="false"
        [placeholder]="placeholder()"
      />
      <hlm-autocomplete-content *hlmAutocompletePortal>
        <hlm-autocomplete-empty>{{ emptyText() }}</hlm-autocomplete-empty>
        <div hlmAutocompleteList>
          @for (o of filtered(); track o.value) {
            <hlm-autocomplete-item [value]="o">
              @if (o.code) {
                <span class="w-9 shrink-0 font-mono text-xs font-medium">{{
                  o.code
                }}</span>
              }
              <span class="min-w-0 flex-1">
                <span class="block truncate">{{ o.label }}</span>
                @if (o.hint) {
                  <span class="block truncate text-xs text-muted-foreground">{{
                    o.hint
                  }}</span>
                }
              </span>
            </hlm-autocomplete-item>
          }
        </div>
      </hlm-autocomplete-content>
    </hlm-autocomplete>
  `,
})
export class OptionAutocomplete {
  readonly value = model<string>('');
  readonly options = input.required<readonly AutocompleteOption[]>();
  readonly disabled = input(false);
  readonly placeholder = input('Search…');
  readonly emptyText = input('No matches');

  private readonly autocomplete =
    viewChild<BrnAutocomplete<AutocompleteOption>>(BrnAutocomplete);

  protected readonly text = text;
  protected readonly sameOption = (
    a: AutocompleteOption,
    b: AutocompleteOption | null | undefined,
  ) => a.value === b?.value;

  protected readonly selected = computed(
    () => this.options().find((o) => o.value === this.value()) ?? null,
  );
  private readonly selectedText = computed(() => {
    const selected = this.selected();
    return selected ? text(selected) : '';
  });

  /** Input text: the selection's label until the user starts typing. */
  protected readonly search = linkedSignal(() => this.selectedText());

  protected readonly filtered = computed(() => {
    const term = this.search();
    // Untouched text is the selection's own label, not a query.
    return term === this.selectedText()
      ? this.options()
      : search(this.options(), term);
  });

  constructor() {
    // Highlighting is done here rather than with brn's `autoHighlight`, which
    // always jumps to the first row and so loses the current selection on open.
    // The key manager keeps its highlight on an item instance; filtering
    // re-renders the list, which would leave Enter picking a row that is no
    // longer shown. Re-point it whenever the list opens or its items change: at the
    // current selection while browsing, at the best match while searching.
    effect(() => {
      const autocomplete = this.autocomplete();
      if (!autocomplete) return;
      const items = autocomplete.items();
      const expanded = autocomplete.isExpanded();
      untracked(() => {
        if (!expanded || items.length === 0) return;
        const browsing = this.search() === this.selectedText();
        const selected = browsing
          ? items.findIndex((item) => item.value().value === this.value())
          : -1;
        autocomplete.keyManager.setActiveItem(Math.max(selected, 0));
      });
    });
  }

  protected pick(option: AutocompleteOption | null | undefined): void {
    if (!option) {
      // brn clears its own value on Escape or emptied text. With the list
      // closed nothing else will put the selection back, so do it here once
      // brn has finished clearing.
      if (!this.autocomplete()?.isExpanded()) {
        queueMicrotask(() => this.restore());
      }
      return;
    }
    this.value.set(option.value);
    this.search.set(text(option));
  }

  /**
   * Puts the selection back as the field's text. Written to brn directly as
   * well: after it clears itself our bound inputs still hold the old values,
   * so the bindings alone would not push them again.
   */
  protected restore(): void {
    const selected = this.selected();
    const label = this.selectedText();
    this.search.set(label);
    const autocomplete = this.autocomplete();
    if (!autocomplete) return;
    if (autocomplete.value()?.value !== selected?.value) {
      autocomplete.value.set(selected);
    }
    if (autocomplete.search() !== label) autocomplete.search.set(label);
  }

  protected open(): void {
    this.autocomplete()?.open();
  }

  /** Leaving the field with half-typed text and no list open: snap back. */
  protected onFocusOut(): void {
    if (!this.autocomplete()?.isExpanded()) this.restore();
  }

  /**
   * Select the current label so typing replaces it instead of appending. Done
   * on click as well as focus: a mouse click's own caret placement lands after
   * the focus event and would undo the selection.
   */
  protected onFocus(event: Event): void {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.value === this.selectedText()
    ) {
      target.select();
    }
  }

  protected onClick(event: MouseEvent): void {
    this.onFocus(event);
    this.open();
  }
}
