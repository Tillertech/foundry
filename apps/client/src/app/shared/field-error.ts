import type { FieldState } from '@angular/forms/signals';

/**
 * First user-facing message for a Signal Forms field, surfaced only once the
 * field has been touched so pristine forms don't shout at the user. Pair with
 * `<app-field [error]="fieldError(f.name())">`.
 */
export function fieldError<T>(state: FieldState<T>): string {
  if (!state.touched() || state.valid()) return '';
  return state.errors()[0]?.message ?? 'Invalid value';
}
