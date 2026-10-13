import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  Currency,
  CurrencyRates,
  convertAmount,
  convertedLabel,
  money,
  num,
} from '@foundry/shared-util';
import { AuthService } from '../auth';
import { InvoicesApiService } from '../invoices';

/**
 * The workspace currency and the rates into it. Records keep the currency
 * they were written in; anything aggregated (totals, charts) or shown as a
 * list row's "≈" subtitle goes through here so it reads in one currency.
 *
 * The API only returns rates for currencies the workspace's records use, so
 * callers `ensure()` a currency after saving a record in a new one.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceCurrencyService {
  private readonly invoicesApi = inject(InvoicesApiService);

  private readonly state = signal<CurrencyRates | null>(null);
  private requestId = 0;

  readonly rates = this.state.asReadonly();
  /** Workspace currency; USD until the first load answers. */
  readonly currency = computed<Currency>(() => this.state()?.target ?? 'USD');

  constructor() {
    // Rates belong to the signed-in account: drop them on sign-out so the
    // next account never reads the previous one's workspace currency.
    const auth = inject(AuthService);
    effect(() => {
      if (!auth.user()) this.clear();
    });
  }

  /** Fetches the rates afresh - call on page init and after the workspace currency changes. */
  refresh(): void {
    const id = ++this.requestId;
    this.invoicesApi.exchangeRates().subscribe({
      next: (rates) => {
        if (id === this.requestId) this.state.set(rates);
      },
      error: () => undefined,
    });
  }

  /** Refetches when a just-saved record uses a currency there is no rate for yet. */
  ensure(currency: Currency): void {
    const rates = this.state();
    if (rates && currency !== rates.target && !(currency in rates.rates)) {
      this.refresh();
    }
  }

  private clear(): void {
    this.requestId++;
    this.state.set(null);
  }

  /** Amount in the workspace currency, or null when no rate is known. */
  convert(amount: number | string, from: Currency): number | null {
    return convertAmount(amount, from, this.state());
  }

  /**
   * For totals and charts: falls back to the raw amount until the rates
   * arrive (or when the rate service has no rate for the currency).
   */
  toWorkspace(amount: number | string, from: Currency): number {
    return this.convert(amount, from) ?? num(amount);
  }

  /** '≈ KES 12,900.00', or '' when already in the workspace currency / not convertible. */
  approx(amount: number | string, from: Currency): string {
    return convertedLabel(amount, from, this.state());
  }

  /** Formats an amount that is already in the workspace currency. */
  format(amount: number | string): string {
    return money(amount, this.currency());
  }
}
