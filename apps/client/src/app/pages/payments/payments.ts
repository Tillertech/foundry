import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch, lucideWallet } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Payment, StoreService, money, newId } from '../../core/store.service';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';

const emptyPayment = (): Payment => ({
  id: '',
  clientId: '',
  invoiceId: '',
  amount: 0,
  currency: 'USD',
  method: 'bank_transfer',
  reference: '',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
});

export const methodLabels: Record<Payment['method'], string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  stripe: 'Stripe',
  paypal: 'PayPal',
  cash: 'Cash',
  other: 'Other',
};

@Component({
  selector: 'app-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmNativeSelectImports,
    DateField,
    EntitySheet,
    Field,
    ListSkeleton,
    PageHeader,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch, lucideWallet })],
  templateUrl: './payments.html',
})
export class Payments {
  protected readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly methodFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected isNew = true;
  protected form: Payment = emptyPayment();

  protected readonly methodOptions = Object.entries(methodLabels) as [Payment['method'], string][];

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.store.clients().map((c) => [c.id, c])),
  );

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const method = this.methodFilter();
    const clientMap = this.clientMap();
    return this.store
      .payments()
      .filter(
        (p) =>
          (method === 'all' || p.method === method) &&
          (!term ||
            (p.reference || '').toLowerCase().includes(term) ||
            (clientMap[p.clientId]?.name || '').toLowerCase().includes(term) ||
            (clientMap[p.clientId]?.company || '').toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  });

  protected readonly total = computed(() =>
    this.filtered().reduce((s, p) => s + p.amount, 0),
  );

  protected get clientInvoices() {
    return this.store
      .invoices()
      .filter((i) => !this.form.clientId || i.clientId === this.form.clientId);
  }

  protected openNew(): void {
    this.form = { ...emptyPayment(), id: newId(), clientId: this.store.clients()[0]?.id ?? '' };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(p: Payment): void {
    this.form = { ...p };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.clientId || this.form.amount <= 0) return;
    this.store.upsert('payments', this.form);
    this.sheetOpen.set(false);
    if (this.isNew) this.toast.created('Payment');
    else this.toast.updated('Payment');
  }

  protected removeCurrent(): void {
    this.store.remove('payments', this.form.id);
    this.sheetOpen.set(false);
    this.toast.deleted('Payment');
  }

  protected onClientChange(clientId: string): void {
    this.form.clientId = clientId;
    this.form.invoiceId = '';
  }

  protected invoiceNumber(id: string | undefined): string {
    if (!id) return '';
    return this.store.invoices().find((i) => i.id === id)?.number ?? '';
  }

  protected label(method: Payment['method']): string {
    return methodLabels[method];
  }

  protected readonly money = money;
}
