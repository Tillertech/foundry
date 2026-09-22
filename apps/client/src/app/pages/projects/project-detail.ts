import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronRight,
  lucideDownload,
  lucideFileText,
  lucidePencil,
  lucidePlus,
  lucideReceipt,
  lucideWallet,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import {
  apiErrorMessage,
  invoiceTotal,
  isoDay,
  money,
  num,
  ReconciliationEntry,
} from '@foundry/shared-util';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import {
  ApiDocument,
  CreateDocumentRequest,
  DocumentsApiService,
} from '../../domains/documents';
import { Expense, ExpensesApiService } from '../../domains/expenses';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import { Milestone, MilestonesApiService } from '../../domains/milestones';
import { Project, ProjectsApiService } from '../../domains/projects';
import { EmptyState, StatusBadge, ToastService } from '@foundry/shared-ui';
import { InvoiceDetailsDialog } from '../../shared/invoice-details-dialog';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { milestoneStatusLabels } from '../../shared/milestone-form-sheet';
import { MilestoneFormSheet } from '../../shared/milestone-form-sheet';
import { MilestonesPanel } from '../../shared/milestones-panel';
import { ProjectFormSheet } from '../../shared/project-form-sheet';
import { ReconciliationTimeline } from '../../shared/reconciliation-timeline';

const expenseCategoryLabels: Record<string, string> = {
  software: 'Software',
  travel: 'Travel',
  meals: 'Meals',
  office: 'Office',
  marketing: 'Marketing',
  other: 'Other',
};

const documentTypeLabels: Record<string, string> = {
  contract: 'Contract',
  nda: 'NDA',
  receipt: 'Receipt',
  report: 'Report',
  other: 'Other',
};

interface ActivityItem {
  icon: string;
  text: string;
  detail: string;
  date: string;
}

/**
 * Everything the real schema and API actually know about a project - no
 * fictional deliverables/hours-logged/internal-notes tabs, just the
 * project's own fields plus its milestones, invoices, expenses, documents
 * and payment timeline.
 */
@Component({
  selector: 'app-project-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmButton,
    HlmTabsImports,
    RouterLink,
    EmptyState,
    StatusBadge,
    MilestoneFormSheet,
    MilestonesPanel,
    ProjectFormSheet,
    ReconciliationTimeline,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideChevronRight,
      lucideDownload,
      lucideFileText,
      lucidePencil,
      lucidePlus,
      lucideReceipt,
      lucideWallet,
    }),
  ],
  templateUrl: './project-detail.html',
})
export class ProjectDetail {
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly expensesApi = inject(ExpensesApiService);
  private readonly documentsApi = inject(DocumentsApiService);
  private readonly milestonesApi = inject(MilestonesApiService);
  private readonly dialogService = inject(HlmDialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly project = signal<Project | null>(null);
  protected readonly client = signal<ApiClient | null>(null);

  protected readonly milestones = signal<Milestone[]>([]);
  protected readonly invoices = signal<Invoice[]>([]);
  protected readonly expenses = signal<Expense[]>([]);
  protected readonly documents = signal<ApiDocument[]>([]);
  protected readonly timeline = signal<ReconciliationEntry[]>([]);

  protected readonly editOpen = signal(false);
  protected readonly milestoneFormOpen = signal(false);
  protected readonly editingMilestone = signal<Milestone | null>(null);
  protected readonly uploadingFile = signal(false);

  protected readonly deliveryMilestones = computed(() =>
    this.milestones().filter((m) => m.status !== 'cancelled'),
  );
  protected readonly completedCount = computed(
    () => this.deliveryMilestones().filter((m) => m.status === 'completed').length,
  );
  protected readonly progress = computed(() => {
    const total = this.deliveryMilestones().length;
    return total ? Math.round((this.completedCount() / total) * 100) : null;
  });
  protected readonly currentMilestone = computed(
    () => this.deliveryMilestones().find((m) => m.status === 'in_progress') ?? null,
  );
  protected readonly nextMilestone = computed(
    () => this.deliveryMilestones().find((m) => m.status === 'not_started') ?? null,
  );
  protected readonly milestonePreview = computed(() => this.milestones().slice(0, 4));

  protected readonly invoicedTotal = computed(() =>
    this.invoices()
      .filter((i) => i.status !== 'cancelled' && i.status !== 'draft')
      .reduce((sum, i) => sum + invoiceTotal(i).total, 0),
  );

  protected readonly billableExpenses = computed(() =>
    this.expenses()
      .filter((e) => e.billable)
      .reduce((sum, e) => sum + Number(e.amount), 0),
  );

  /** Latest reconciliation entry carries the current remaining project budget. */
  protected readonly remainingBudget = computed(() => {
    const project = this.project();
    if (!project) return 0;
    const latest = this.timeline()[0];
    return latest?.projectBalance != null
      ? num(latest.projectBalance)
      : num(project.budget);
  });
  protected readonly paymentsReceived = computed(() => {
    const project = this.project();
    if (!project) return 0;
    return Math.max(0, num(project.budget) - this.remainingBudget());
  });

  // todo: push to api
  protected readonly recentActivity = computed<ActivityItem[]>(() => {
    const rows: ActivityItem[] = [];
    for (const m of this.milestones()) {
      rows.push({
        icon: 'lucideCheck',
        text: m.status === 'completed' ? `${m.name} completed` : `${m.name} added`,
        detail: milestoneStatusLabels[m.status],
        date: m.completedAt || m.createdAt,
      });
    }
    for (const d of this.documents()) {
      rows.push({
        icon: 'lucideFileText',
        text: `${d.name} uploaded`,
        detail: 'Project file',
        date: d.uploadedAt,
      });
    }
    for (const inv of this.invoices()) {
      rows.push({
        icon: 'lucideReceipt',
        text: `${inv.number} created`,
        detail: `${money(invoiceTotal(inv).total, inv.currency)} · ${inv.status}`,
        date: inv.issueDate,
      });
    }
    for (const e of this.timeline()) {
      rows.push({
        icon: 'lucideWallet',
        text: e.kind === 'payment_reversed' ? 'Payment reversed' : 'Payment applied',
        detail: `${e.note || money(Math.abs(num(e.amount)), e.currency)}`,
        date: e.createdAt,
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  });

  constructor() {
    // Angular reuses this component across `/projects/:id` navigations, so
    // reload everything whenever the route id itself changes.
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.projectsApi.get(id).subscribe({
      next: (project) => {
        this.project.set(project);
        this.loading.set(false);
        this.clientsApi.get(project.clientId).subscribe({
          next: (client) => this.client.set(client),
          error: () => undefined,
        });
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });

    this.loadMilestones(id);
    this.invoicesApi.list({ projectId: id, take: 100 }).subscribe({
      next: (res) => this.invoices.set(res.results),
      error: () => undefined,
    });
    this.expensesApi.list({ projectId: id, take: 100 }).subscribe({
      next: (res) => this.expenses.set(res.results),
      error: () => undefined,
    });
    this.documentsApi.list({ projectId: id, take: 100 }).subscribe({
      next: (res) => this.documents.set(res.results),
      error: () => undefined,
    });
    this.projectsApi.timeline(id, { take: 20 }).subscribe({
      next: (res) => this.timeline.set(res.results),
      error: () => undefined,
    });
  }

  private loadMilestones(id: string): void {
    this.milestonesApi.listForProject(id).subscribe({
      next: (list) => this.milestones.set(list),
      error: () => undefined,
    });
  }

  protected onProjectSaved(project: Project): void {
    this.project.set(project);
    if (project.clientId !== this.client()?.id) {
      this.clientsApi.get(project.clientId).subscribe({
        next: (client) => this.client.set(client),
        error: () => undefined,
      });
    }
  }

  protected onProjectDeleted(): void {
    this.toast.deleted('Project');
    this.router.navigate(['/projects']);
  }

  protected openNewMilestone(): void {
    this.editingMilestone.set(null);
    this.milestoneFormOpen.set(true);
  }

  protected openMilestone(m: Milestone): void {
    this.editingMilestone.set(m);
    this.milestoneFormOpen.set(true);
  }

  protected onMilestoneSaved(saved: Milestone): void {
    this.milestones.update((list) => {
      const exists = list.some((m) => m.id === saved.id);
      return exists
        ? list.map((m) => (m.id === saved.id ? saved : m))
        : [...list, saved].sort((a, b) => a.order - b.order);
    });
  }

  protected onMilestoneDeleted(id: string): void {
    this.milestones.update((list) => list.filter((m) => m.id !== id));
  }

  protected openInvoice(invoiceId: string): void {
    this.dialogService.open(InvoiceDetailsDialog, {
      contentClass: 'sm:max-w-lg',
      context: { invoiceId },
    });
  }

  protected onFileSelected(event: Event): void {
    const project = this.project();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!project || !file || this.uploadingFile()) return;
    this.uploadingFile.set(true);
    const meta: CreateDocumentRequest = {
      projectId: project.id,
      clientId: project.clientId,
    };
    this.documentsApi.create(file, meta).subscribe({
      next: (doc) => {
        this.uploadingFile.set(false);
        this.documents.update((list) => [doc, ...list]);
        this.toast.success('File uploaded');
      },
      error: (err) => {
        this.uploadingFile.set(false);
        this.toast.error('Could not upload file', apiErrorMessage(err));
      },
    });
  }

  protected downloadDocument(doc: ApiDocument): void {
    this.documentsApi.download(doc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) =>
        this.toast.error('Could not download document', apiErrorMessage(err)),
    });
  }

  protected invoiceTotal(inv: Invoice): number {
    return invoiceTotal(inv).total;
  }

  protected readonly statusLabel = (v: string) =>
    milestoneStatusLabels[v as Milestone['status']] ?? v;
  protected readonly expenseCategoryLabel = (v: string) =>
    expenseCategoryLabels[v] ?? v;
  protected readonly documentTypeLabel = (v: string) =>
    documentTypeLabels[v] ?? v;

  protected fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected readonly money = money;
  protected readonly isoDay = isoDay;
}
