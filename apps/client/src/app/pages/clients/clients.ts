import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMail, lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/http';
import {
  ApiClient,
  ClientsApiService,
  CreateClientRequest,
} from '../../domains/clients';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import {
  ClientStatus,
  Currency,
  invoiceTotal,
  money,
} from '../../domains/shared';
import { ToastService } from '../../core/toast.service';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { StatusBadge } from '../../shared/status-badge';

interface ClientForm {
  id: string;
  name: string;
  email: string;
  company: string;
  currency: Currency;
  status: ClientStatus;
  taxId: string;
  address: string;
  notes: string;
}

const emptyClient = (): ClientForm => ({
  id: '',
  name: '',
  email: '',
  company: '',
  currency: 'USD',
  status: 'active',
  taxId: '',
  address: '',
  notes: '',
});

@Component({
  selector: 'app-clients',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmNativeSelectImports,
    EntitySheet,
    Field,
    ListSkeleton,
    PageHeader,
    StatusBadge,
  ],
  providers: [provideIcons({ lucideMail, lucidePlus, lucideSearch })],
  templateUrl: './clients.html',
})
export class Clients {
  private readonly clientsApi = inject(ClientsApiService);
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly clients = signal<ApiClient[]>([]);
  private readonly invoices = signal<Invoice[]>([]);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected isNew = true;
  protected form: ClientForm = emptyClient();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.refresh();
  }

  private refresh(): void {
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.clients.set(res.results);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load clients', apiErrorMessage(err));
      },
    });
    this.invoicesApi.list({ take: 100 }).subscribe({
      next: (res) => this.invoices.set(res.results),
      error: () => undefined,
    });
  }

  protected readonly revenueByClient = computed(() => {
    const map: Record<string, number> = {};
    for (const inv of this.invoices()) {
      if (inv.status !== 'paid') continue;
      map[inv.clientId] = (map[inv.clientId] || 0) + invoiceTotal(inv).total;
    }
    return map;
  });

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    return this.clients().filter(
      (c) =>
        (status === 'all' || c.status === status) &&
        (!term ||
          c.name.toLowerCase().includes(term) ||
          c.email.toLowerCase().includes(term) ||
          (c.company || '').toLowerCase().includes(term)),
    );
  });

  protected openNew(): void {
    this.form = emptyClient();
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(c: ApiClient): void {
    this.form = {
      id: c.id,
      name: c.name,
      email: c.email,
      company: c.company ?? '',
      currency: c.currency,
      status: c.status,
      taxId: c.taxId ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
    };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.name.trim() || this.saving()) return;
    const body: CreateClientRequest = {
      name: this.form.name.trim(),
      email: this.form.email.trim(),
      company: this.form.company.trim() || undefined,
      currency: this.form.currency,
      status: this.form.status,
      taxId: this.form.taxId.trim() || undefined,
      address: this.form.address.trim() || undefined,
      notes: this.form.notes.trim() || undefined,
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.clientsApi.create(body)
      : this.clientsApi.update(this.form.id, body);
    request.subscribe({
      next: (client) => {
        this.saving.set(false);
        this.clients.update((list) =>
          this.isNew
            ? [client, ...list]
            : list.map((c) => (c.id === client.id ? client : c)),
        );
        this.sheetOpen.set(false);
        if (this.isNew) this.toast.created('Client');
        else this.toast.updated('Client');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save client', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.form.id;
    this.clientsApi.delete(id).subscribe({
      next: () => {
        this.clients.update((list) => list.filter((c) => c.id !== id));
        this.sheetOpen.set(false);
        this.toast.deleted('Client');
      },
      error: (err) =>
        this.toast.error('Could not delete client', apiErrorMessage(err)),
    });
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('');
  }

  protected readonly money = money;
}
