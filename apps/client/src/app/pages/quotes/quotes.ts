import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import {
  InvoiceItem,
  Quote,
  StoreService,
  money,
  newId,
  nextNumber,
  quoteTotal,
} from '../../core/store.service';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { LineItemsEditor } from '../../shared/line-items-editor';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { StatusBadge } from '../../shared/status-badge';

const emptyQuote = (): Quote => ({
  id: '',
  number: '',
  clientId: '',
  status: 'draft',
  issueDate: new Date().toISOString().slice(0, 10),
  validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
  currency: 'USD',
  items: [],
  taxRate: 0,
  notes: '',
});

@Component({
  selector: 'app-quotes',
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
    LineItemsEditor,
    ListSkeleton,
    PageHeader,
    StatusBadge,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch })],
  templateUrl: './quotes.html',
})
export class Quotes {
  protected readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected isNew = true;
  protected form: Quote = emptyQuote();

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.store.clients().map((c) => [c.id, c])),
  );

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    const clientMap = this.clientMap();
    return this.store
      .quotes()
      .filter(
        (q) =>
          (status === 'all' || q.status === status) &&
          (!term ||
            q.number.toLowerCase().includes(term) ||
            (clientMap[q.clientId]?.company || clientMap[q.clientId]?.name || '')
              .toLowerCase()
              .includes(term)),
      )
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  });

  protected get totals() {
    return quoteTotal(this.form);
  }

  protected openNew(): void {
    const c = this.store.clients()[0];
    this.form = {
      ...emptyQuote(),
      id: newId(),
      number: nextNumber(this.store.quotes(), 'Q-'),
      clientId: c?.id ?? '',
      currency: c?.currency ?? 'USD',
      items: [{ id: newId(), description: '', quantity: 1, rate: 0 }],
    };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(q: Quote): void {
    this.form = { ...q, items: q.items.map((it) => ({ ...it })) };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.clientId || this.form.items.length === 0) return;
    this.store.upsert('quotes', this.form);
    this.sheetOpen.set(false);
    if (this.isNew) this.toast.created('Quote');
    else this.toast.updated('Quote');
  }

  protected removeCurrent(): void {
    this.store.remove('quotes', this.form.id);
    this.sheetOpen.set(false);
    this.toast.deleted('Quote');
  }

  protected onClientChange(clientId: string): void {
    const c = this.store.clients().find((x) => x.id === clientId);
    this.form.clientId = clientId;
    if (c) this.form.currency = c.currency;
  }

  protected onItemsChange(items: InvoiceItem[]): void {
    this.form.items = items;
  }

  protected total(q: Quote): number {
    return quoteTotal(q).total;
  }

  protected readonly money = money;
}
