import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideReceipt, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Expense, StoreService, money, newId } from '../../core/store.service';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';

const emptyExpense = (): Expense => ({
  id: '',
  vendor: '',
  category: 'software',
  amount: 0,
  currency: 'USD',
  date: new Date().toISOString().slice(0, 10),
  projectId: '',
  billable: false,
  notes: '',
});

export const catLabels: Record<Expense['category'], string> = {
  software: 'Software',
  travel: 'Travel',
  meals: 'Meals',
  office: 'Office',
  marketing: 'Marketing',
  other: 'Other',
};

@Component({
  selector: 'app-expenses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmNativeSelectImports,
    HlmSwitchImports,
    DateField,
    EntitySheet,
    Field,
    ListSkeleton,
    PageHeader,
  ],
  providers: [provideIcons({ lucidePlus, lucideReceipt, lucideSearch })],
  templateUrl: './expenses.html',
})
export class Expenses {
  protected readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly catFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected isNew = true;
  protected form: Expense = emptyExpense();

  protected readonly catOptions = Object.entries(catLabels) as [Expense['category'], string][];

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const cat = this.catFilter();
    return this.store
      .expenses()
      .filter(
        (e) =>
          (cat === 'all' || e.category === cat) &&
          (!term || e.vendor.toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  });

  protected readonly total = computed(() =>
    this.filtered().reduce((s, e) => s + e.amount, 0),
  );

  protected readonly billable = computed(() =>
    this.filtered()
      .filter((e) => e.billable)
      .reduce((s, e) => s + e.amount, 0),
  );

  protected openNew(): void {
    this.form = { ...emptyExpense(), id: newId() };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(e: Expense): void {
    this.form = { ...e };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.vendor.trim() || this.form.amount <= 0) return;
    this.store.upsert('expenses', this.form);
    this.sheetOpen.set(false);
    if (this.isNew) this.toast.created('Expense');
    else this.toast.updated('Expense');
  }

  protected removeCurrent(): void {
    this.store.remove('expenses', this.form.id);
    this.sheetOpen.set(false);
    this.toast.deleted('Expense');
  }

  protected projectName(id: string | undefined): string {
    if (!id) return '';
    return this.store.projects().find((p) => p.id === id)?.name ?? '';
  }

  protected label(cat: Expense['category']): string {
    return catLabels[cat];
  }

  protected readonly money = money;
}
