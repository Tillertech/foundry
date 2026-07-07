import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormField, form, min, minLength, required } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideReceipt, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/http';
import {
  CreateExpenseRequest,
  Expense,
  ExpenseCategory,
  ExpensesApiService,
} from '../../domains/expenses';
import { Project, ProjectsApiService } from '../../domains/projects';
import { Currency, isoDay, money, num, toApiDate } from '../../domains/shared';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';

interface ExpenseForm {
  id: string;
  vendor: string;
  category: ExpenseCategory;
  amount: number;
  currency: Currency;
  date: string;
  projectId: string;
  billable: boolean;
  notes: string;
}

const emptyExpense = (): ExpenseForm => ({
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

export const catLabels: Record<ExpenseCategory, string> = {
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
    FormField,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmSelectImports,
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
  private readonly expensesApi = inject(ExpensesApiService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly expenses = signal<Expense[]>([]);
  protected readonly projects = signal<Project[]>([]);

  protected readonly query = signal('');
  protected readonly catFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected isNew = true;

  protected readonly model = signal<ExpenseForm>(emptyExpense());
  protected readonly f = form(this.model, (p) => {
    required(p.vendor, { message: 'Vendor is required' });
    minLength(p.vendor, 2, { message: 'Use at least 2 characters' });
    min(p.amount, 0.01, { message: 'Amount must be greater than 0' });
  });
  protected readonly fieldError = fieldError;

  protected readonly catOptions = Object.entries(catLabels) as [
    ExpenseCategory,
    string,
  ][];

  protected readonly catFilterLabel = (v: string) =>
    v === 'all' ? 'All categories' : (catLabels[v as ExpenseCategory] ?? v);
  protected readonly catLabel = (v: string) =>
    catLabels[v as ExpenseCategory] ?? v;
  protected readonly projectLabel = (v: string) =>
    v ? (this.projects().find((p) => p.id === v)?.name ?? v) : 'Not linked';

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.refresh();
  }

  private refresh(): void {
    this.expensesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.expenses.set(res.results);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load expenses', apiErrorMessage(err));
      },
    });
    this.projectsApi.list({ take: 100 }).subscribe({
      next: (res) => this.projects.set(res.results),
      error: () => undefined,
    });
  }

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const cat = this.catFilter();
    return this.expenses()
      .filter(
        (e) =>
          (cat === 'all' || e.category === cat) &&
          (!term || e.vendor.toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  });

  protected readonly total = computed(() =>
    this.filtered().reduce((s, e) => s + num(e.amount), 0),
  );

  protected readonly billable = computed(() =>
    this.filtered()
      .filter((e) => e.billable)
      .reduce((s, e) => s + num(e.amount), 0),
  );

  protected openNew(): void {
    this.model.set(emptyExpense());
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(e: Expense): void {
    this.model.set({
      id: e.id,
      vendor: e.vendor,
      category: e.category,
      amount: num(e.amount),
      currency: e.currency,
      date: isoDay(e.date),
      projectId: e.projectId ?? '',
      billable: e.billable,
      notes: e.notes ?? '',
    });
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (this.f().invalid() || this.saving()) return;
    const v = this.model();
    const body: CreateExpenseRequest = {
      vendor: v.vendor.trim(),
      category: v.category,
      amount: num(v.amount),
      currency: v.currency,
      date: toApiDate(v.date),
      billable: v.billable,
      projectId: v.projectId || undefined,
      notes: v.notes.trim() || undefined,
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.expensesApi.create(body)
      : this.expensesApi.update(v.id, body);
    request.subscribe({
      next: (expense) => {
        this.saving.set(false);
        this.expenses.update((list) =>
          this.isNew
            ? [expense, ...list]
            : list.map((e) => (e.id === expense.id ? expense : e)),
        );
        this.sheetOpen.set(false);
        if (this.isNew) this.toast.created('Expense');
        else this.toast.updated('Expense');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save expense', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.model().id;
    this.expensesApi.delete(id).subscribe({
      next: () => {
        this.expenses.update((list) => list.filter((e) => e.id !== id));
        this.sheetOpen.set(false);
        this.toast.deleted('Expense');
      },
      error: (err) =>
        this.toast.error('Could not delete expense', apiErrorMessage(err)),
    });
  }

  protected projectName(id: string | null | undefined): string {
    if (!id) return '';
    return this.projects().find((p) => p.id === id)?.name ?? '';
  }

  protected label(cat: ExpenseCategory): string {
    return catLabels[cat];
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
