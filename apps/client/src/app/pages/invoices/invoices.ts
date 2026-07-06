import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import {
  Invoice,
  InvoiceItem,
  StoreService,
  invoiceTotal,
  money,
  newId,
  nextNumber,
} from '../../core/store.service';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { LineItemsEditor } from '../../shared/line-items-editor';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { StatusBadge } from '../../shared/status-badge';

const emptyInvoice = (): Invoice => ({
  id: '',
  number: '',
  clientId: '',
  projectId: '',
  status: 'draft',
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
  currency: 'USD',
  items: [],
  taxRate: 0,
  discount: 0,
  notes: '',
});

@Component({
  selector: 'app-invoices',
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
  templateUrl: './invoices.html',
})
export class Invoices {
  protected readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly clientFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected isNew = true;
  protected form: Invoice = emptyInvoice();

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.store.clients().map((c) => [c.id, c])),
  );

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    const client = this.clientFilter();
    const clientMap = this.clientMap();
    return this.store
      .invoices()
      .filter(
        (i) =>
          (status === 'all' || i.status === status) &&
          (client === 'all' || i.clientId === client) &&
          (!term ||
            i.number.toLowerCase().includes(term) ||
            (clientMap[i.clientId]?.name || '').toLowerCase().includes(term) ||
            (clientMap[i.clientId]?.company || '').toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  });

  protected readonly totalOutstanding = computed(() =>
    this.filtered()
      .filter((i) => i.status === 'sent' || i.status === 'viewed' || i.status === 'overdue')
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected get clientProjects() {
    return this.store
      .projects()
      .filter((p) => !this.form.clientId || p.clientId === this.form.clientId);
  }

  protected get totals() {
    return invoiceTotal(this.form);
  }

  protected openNew(): void {
    const c = this.store.clients()[0];
    this.form = {
      ...emptyInvoice(),
      id: newId(),
      number: nextNumber(this.store.invoices()),
      clientId: c?.id ?? '',
      currency: c?.currency ?? 'USD',
      items: [{ id: newId(), description: '', quantity: 1, rate: 0 }],
    };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(i: Invoice): void {
    this.form = { ...i, items: i.items.map((it) => ({ ...it })) };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.clientId || this.form.items.length === 0) return;
    this.store.upsert('invoices', this.form);
    this.sheetOpen.set(false);
    if (this.isNew) this.toast.created('Invoice');
    else this.toast.updated('Invoice');
  }

  protected removeCurrent(): void {
    this.store.remove('invoices', this.form.id);
    this.sheetOpen.set(false);
    this.toast.deleted('Invoice');
  }

  protected onClientChange(clientId: string): void {
    const c = this.store.clients().find((x) => x.id === clientId);
    this.form.clientId = clientId;
    this.form.projectId = '';
    if (c) this.form.currency = c.currency;
  }

  protected onItemsChange(items: InvoiceItem[]): void {
    this.form.items = items;
  }

  protected projectName(id: string | undefined): string {
    if (!id) return '';
    return this.store.projects().find((p) => p.id === id)?.name ?? '';
  }

  protected total(i: Invoice): number {
    return invoiceTotal(i).total;
  }

  protected readonly money = money;
}
