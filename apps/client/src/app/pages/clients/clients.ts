import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMail, lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import {
  Client,
  StoreService,
  invoiceTotal,
  money,
  newId,
} from '../../core/store.service';
import { ToastService } from '../../core/toast.service';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { StatusBadge } from '../../shared/status-badge';

const emptyClient = (): Client => ({
  id: '',
  name: '',
  email: '',
  company: '',
  currency: 'USD',
  status: 'active',
  taxId: '',
  address: '',
  notes: '',
  createdAt: '',
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
  protected readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected isNew = true;
  protected form: Client = emptyClient();

  protected readonly revenueByClient = computed(() => {
    const map: Record<string, number> = {};
    for (const inv of this.store.invoices()) {
      if (inv.status !== 'paid') continue;
      map[inv.clientId] = (map[inv.clientId] || 0) + invoiceTotal(inv).total;
    }
    return map;
  });

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    return this.store
      .clients()
      .filter(
        (c) =>
          (status === 'all' || c.status === status) &&
          (!term ||
            c.name.toLowerCase().includes(term) ||
            c.email.toLowerCase().includes(term) ||
            (c.company || '').toLowerCase().includes(term)),
      );
  });

  protected openNew(): void {
    this.form = {
      ...emptyClient(),
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(c: Client): void {
    this.form = { ...c };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.name.trim()) return;
    this.store.upsert('clients', this.form);
    this.sheetOpen.set(false);
    if (this.isNew) this.toast.created('Client');
    else this.toast.updated('Client');
  }

  protected removeCurrent(): void {
    this.store.remove('clients', this.form.id);
    this.sheetOpen.set(false);
    this.toast.deleted('Client');
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
