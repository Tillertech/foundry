import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { HlmDatePicker, HlmDatePickerTrigger } from '@spartan-ng/helm/date-picker';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Spartan date picker bound to the store's `YYYY-MM-DD` string dates.
 */
@Component({
  selector: 'app-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDatePicker, HlmDatePickerTrigger],
  template: `
    <hlm-date-picker
      class="w-full"
      captionLayout="dropdown"
      autoCloseOnSelect
      [date]="dateValue()"
      (dateChange)="onDateChange($event)"
    >
      <hlm-date-picker-trigger class="w-full">
        {{ placeholder() }}
      </hlm-date-picker-trigger>
    </hlm-date-picker>
  `,
})
export class DateField {
  readonly value = model<string | undefined>('');
  readonly placeholder = input('Pick a date');

  protected readonly dateValue = computed<Date | undefined>(() => {
    const v = this.value();
    if (!v) return undefined;
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  });

  protected onDateChange(date: Date | undefined): void {
    this.value.set(
      date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '',
    );
  }
}
