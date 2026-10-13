import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
} from '@angular/core';
import { CURRENCIES, Currency } from '@foundry/shared-util';
import { AutocompleteOption, OptionAutocomplete } from './option-autocomplete';

const OPTIONS: readonly AutocompleteOption[] = CURRENCIES.map((c) => ({
  value: c.code,
  code: c.code,
  label: c.name,
}));

/**
 * Type-to-search picker over the shared ISO 4217 catalogue. A signal-forms
 * value control (`[formField]`) as well as a plain `[(value)]` one.
 */
@Component({
  selector: 'app-currency-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [OptionAutocomplete],
  template: `
    <app-option-autocomplete
      emptyText="No currency found"
      [options]="options"
      [value]="value()"
      [disabled]="disabled()"
      [placeholder]="placeholder()"
      (valueChange)="pick($event)"
    />
  `,
})
export class CurrencyAutocomplete {
  readonly value = model<Currency>('USD');
  readonly disabled = input(false);
  readonly placeholder = input('Search currencies…');

  protected readonly options = OPTIONS;

  protected pick(code: string): void {
    this.value.set(code as Currency);
  }
}
