import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCalendarDays,
  lucideCheck,
  lucideChevronRight,
  lucideCircleDot,
  lucideCirclePause,
  lucideFileSignature,
  lucideDownload,
  lucideFileText,
  lucidePackageCheck,
  lucideReceipt,
  lucideShieldCheck,
  lucideTriangleAlert,
  lucideWallet,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import { Payment, PaymentsApiService } from '../../domains/payments';
import { InvoiceTable } from '../../shared/invoice-table';
import { PaymentTable } from '../../shared/payment-table';
import { InvoiceDetailDialog } from '../invoices/invoice-detail-dialog';
import { ToastService } from '@foundry/shared-ui';
import {
  MilestoneReviewContext,
  MilestoneReviewDialog,
  MilestoneReviewResult,
} from './milestone-review-dialog';
import { PortalAuthService } from '../../domains/auth';
import { DocumentItem, DocumentsApiService } from '../../domains/documents';
import {
  isMilestoneDone,
  MILESTONE_STAGES,
  milestoneProgress,
  Project,
  ProjectFinancials,
  ProjectMilestone,
  ProjectsApiService,
  projectProgress,
} from '../../domains/projects';
import { PortalRealtimeService } from '../../domains/realtime';
import { refreshOne } from '../../core/live-list';

const byOrder = (a: ProjectMilestone, b: ProjectMilestone) => a.order - b.order;
import { isoDay, money } from '@foundry/shared-util';
import { saveBlob } from '../../core/download-file';
import { StatusBadge } from '@foundry/shared-ui';

type TimelineState = 'done' | 'review' | 'active' | 'hold' | 'upcoming' | 'cancelled';

interface TimelineItem {
  milestone: ProjectMilestone;
  state: TimelineState;
  /** The first upcoming milestone - what starts next. */
  next: boolean;
  deliverablesDone: number;
  deliverablesTotal: number;
  date: string | null;
  dateLabel: string;
}

interface ActionItem {
  key: string;
  tone: 'review' | 'overdue' | 'payment';
  icon: string;
  title: string;
  detail: string;
  cta: string;
  run: () => void;
}

interface ActivityItem {
  key: string;
  icon: string;
  text: string;
  date: string;
}

@Component({
  selector: 'app-portal-project-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButton,
    HlmTabsImports,
    StatusBadge,
    InvoiceTable,
    PaymentTable,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCalendarDays,
      lucideCheck,
      lucideChevronRight,
      lucideCircleDot,
      lucideCirclePause,
      lucideFileSignature,
      lucideDownload,
      lucideFileText,
      lucidePackageCheck,
      lucideReceipt,
      lucideShieldCheck,
      lucideTriangleAlert,
      lucideWallet,
    }),
  ],
  templateUrl: './project-detail.html',
})
export class ProjectDetail {
  protected readonly isDone = isMilestoneDone;
  readonly id = input.required<string>();
  /** `?view=milestones` (from a notification) opens that tab. */
  readonly view = input<string>();

  private readonly projectsApi = inject(ProjectsApiService);
  private readonly documentsApi = inject(DocumentsApiService);
  private readonly realtime = inject(PortalRealtimeService);
  protected readonly auth = inject(PortalAuthService);
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly dialogService = inject(HlmDialogService);
  private readonly toast = inject(ToastService);
  protected readonly stages = MILESTONE_STAGES;

  /** This project's money side - loaded only when the portal shows payments. */
  protected readonly financials = signal<ProjectFinancials | null>(null);
  protected readonly invoices = signal<Invoice[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly billingLoading = signal(false);

  /** Stacked bar across the budget: paid / invoiced-unpaid / not yet invoiced. */
  protected readonly budgetBar = computed(() => {
    const f = this.financials();
    if (!f) return null;
    const scale = Math.max(f.budget, f.invoiced, 1);
    const pct = (n: number) => Math.min(100, (n / scale) * 100);
    return {
      paid: pct(f.paid),
      outstanding: pct(f.outstanding),
      overBudget: f.invoiced > f.budget * 1.0001 && f.budget > 0,
      paidOfInvoiced: f.invoiced ? Math.round((f.paid / f.invoiced) * 100) : null,
    };
  });
  protected readonly milestoneProgress = milestoneProgress;

  protected readonly isoDay = isoDay;
  protected readonly money = money;

  protected readonly tab = signal('overview');
  protected readonly loading = signal(true);
  protected readonly project = signal<Project | null>(null);
  protected readonly documents = signal<DocumentItem[]>([]);
  protected readonly documentsLoading = signal(false);

  protected readonly permission = computed(
    () => this.auth.me()?.clientPortal.permission ?? null,
  );

  protected readonly base = computed(() => `/${this.auth.slug() ?? ''}`);

  protected readonly projectsLink = computed(
    () => `/${this.auth.slug() ?? ''}/projects`,
  );

  protected readonly projectDocs = computed(() =>
    this.documents().filter((d) => d.projectId === this.id()),
  );

  protected readonly progress = computed(() => {
    const project = this.project();
    return project ? projectProgress(project.milestones) : null;
  });

  /** Where each milestone sits on the overview timeline. */
  protected readonly timeline = computed<TimelineItem[]>(() => {
    const ms = this.project()?.milestones ?? [];
    let activeSeen = false;
    return ms.map((m) => {
      const prog = milestoneProgress(m);
      let state: TimelineState;
      if (m.status === 'cancelled') state = 'cancelled';
      else if (isMilestoneDone(m)) state = 'done';
      else if (m.status === 'delivered') state = 'review';
      else if (m.status === 'in_progress') state = 'active';
      else if (m.status === 'on_hold') state = 'hold';
      else state = 'upcoming';
      // The first not-yet-started milestone after the work in hand is "next".
      const next = state === 'upcoming' && !activeSeen;
      if (state === 'upcoming') activeSeen = true;
      return {
        milestone: m,
        state,
        next,
        deliverablesDone: prog.deliverablesDone,
        deliverablesTotal: prog.deliverablesTotal,
        date:
          m.acceptedAt ?? m.completedAt ?? m.deliveredAt ?? m.dueDate ?? null,
        dateLabel:
          state === 'done'
            ? m.acceptedAt
              ? 'Signed off'
              : 'Completed'
            : state === 'review'
              ? 'Delivered'
              : 'Due',
      };
    });
  });

  /**
   * The project description, minus the "Created from quote Q-…." line that
   * quote conversion writes - the header already links that quote.
   */
  protected readonly description = computed(() => {
    const p = this.project();
    const text = p?.description?.trim() ?? '';
    if (!text) return null;
    if (p?.quote && text === `Created from quote ${p.quote.number}.`) return null;
    return text;
  });

  /** Deliverables ticked off across the project (non-cancelled milestones); null when none are listed. */
  protected readonly deliverableTotals = computed(() => {
    let done = 0;
    let total = 0;
    for (const m of this.project()?.milestones ?? []) {
      if (m.status === 'cancelled') continue;
      total += m.deliverables?.length ?? 0;
      done += m.deliverables?.filter((d) => d.done).length ?? 0;
    }
    return total ? { done, total } : null;
  });

  /** A factual status line for the delivery panel: something past due, or waiting on the client. */
  protected readonly deliveryNote = computed<{ tone: 'late' | 'review'; text: string } | null>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const late = (this.project()?.milestones ?? []).filter(
      (m) =>
        m.dueDate &&
        m.dueDate.slice(0, 10) < today &&
        !isMilestoneDone(m) &&
        m.status !== 'delivered' &&
        m.status !== 'cancelled',
    ).length;
    if (late) {
      return { tone: 'late', text: `${late} milestone${late === 1 ? '' : 's'} past due` };
    }
    const review = this.awaitingReview().length;
    return review ? { tone: 'review', text: 'Waiting on your review' } : null;
  });

  /** Expected completion: the agreed end date, else the last milestone's due date. */
  protected readonly expectedEnd = computed(() => {
    const p = this.project();
    if (!p) return null;
    if (p.endDate) return p.endDate;
    const due = p.milestones
      .filter((m) => m.status !== 'cancelled' && m.dueDate)
      .map((m) => m.dueDate as string)
      .sort();
    return due.length ? due[due.length - 1] : null;
  });

  /**
   * What the client actually needs to do on this project, most pressing
   * first: review delivered milestones, settle overdue invoices, pay what's
   * due in the next two weeks. Built only from real records.
   */
  protected readonly actionItems = computed<ActionItem[]>(() => {
    const items: ActionItem[] = [];
    for (const m of this.awaitingReview()) {
      const prog = milestoneProgress(m);
      items.push({
        key: `review-${m.id}`,
        tone: 'review',
        icon: 'lucidePackageCheck',
        title: `Review "${m.name}"`,
        detail: prog.deliverablesTotal
          ? `Delivered ${m.deliveredAt ? isoDay(m.deliveredAt) : ''} · ${prog.deliverablesDone} of ${prog.deliverablesTotal} deliverables complete`
          : `Delivered ${m.deliveredAt ? isoDay(m.deliveredAt) : ''} · check it against the acceptance criteria`,
        cta: 'Review',
        run: () => this.openReview(m),
      });
    }
    const soon = Date.now() + 14 * 864e5;
    const owed = this.invoices()
      .filter((i) => i.status !== 'cancelled' && i.balanceDue > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (const inv of owed) {
      const due = new Date(inv.dueDate).getTime();
      const overdue = inv.status === 'overdue' || due < Date.now();
      if (!overdue && due > soon) continue;
      items.push({
        key: `invoice-${inv.id}`,
        tone: overdue ? 'overdue' : 'payment',
        icon: 'lucideReceipt',
        title: overdue
          ? `${inv.number} is overdue`
          : `Payment due on ${inv.number}`,
        detail: `${money(inv.balanceDue, inv.currency)} ${overdue ? 'was due' : 'due'} ${isoDay(inv.dueDate)}`,
        cta: 'View invoice',
        run: () => this.openInvoice(inv),
      });
    }
    return items;
  });

  /**
   * A short, client-appropriate history from real records: milestone
   * hand-overs and sign-offs, invoices issued, payments received, files
   * shared. Newest first.
   */
  protected readonly activity = computed<ActivityItem[]>(() => {
    const rows: ActivityItem[] = [];
    for (const m of this.project()?.milestones ?? []) {
      if (m.acceptedAt) {
        rows.push({ key: `a-${m.id}`, icon: 'lucideCheck', text: `${m.name} signed off`, date: m.acceptedAt });
      } else if (m.completedAt) {
        rows.push({ key: `c-${m.id}`, icon: 'lucideCheck', text: `${m.name} completed`, date: m.completedAt });
      }
      if (m.deliveredAt) {
        rows.push({ key: `d-${m.id}`, icon: 'lucidePackageCheck', text: `${m.name} delivered for review`, date: m.deliveredAt });
      }
    }
    for (const inv of this.invoices()) {
      rows.push({ key: `i-${inv.id}`, icon: 'lucideReceipt', text: `Invoice ${inv.number} issued · ${money(inv.total, inv.currency)}`, date: inv.issueDate });
    }
    for (const pay of this.payments()) {
      rows.push({
        key: `p-${pay.id}`,
        icon: 'lucideWallet',
        text: `Payment of ${money(pay.amount, pay.currency)} received${pay.invoice ? ` for ${pay.invoice.number}` : ''}`,
        date: pay.date,
      });
    }
    for (const d of this.projectDocs()) {
      rows.push({ key: `f-${d.id}`, icon: 'lucideFileText', text: `${d.name} shared`, date: d.uploadedAt });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  });

  protected readonly retentionPercent = computed(() =>
    Number(this.project()?.retentionPercent ?? 0),
  );

  /** Milestones handed over and waiting on the client's review. */
  protected readonly awaitingReview = computed(() =>
    (this.project()?.milestones ?? []).filter((m) => m.status === 'delivered'),
  );

  /** Milestone ids just changed by a live update, briefly highlighted. */
  protected readonly fresh = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // Signal inputs aren't guaranteed set until after the constructor runs -
    // defer the id()-dependent fetch to an effect.
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.load(id, true);
        this.loadBilling(id);
      });
    });
    effect(() => {
      const tab = this.view();
      if (tab) untracked(() => this.tab.set(tab));
    });

    // Workspace-side milestone changes on this project arrive live: fetch
    // just the changed milestone and swap it in (or drop it), then flash it.
    // A reorder moves every position, so only that refetches the project.
    const destroyRef = inject(DestroyRef);
    this.realtime.milestones$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((change) => {
        if (change.projectId !== this.id()) return;
        if (!change.milestoneId) {
          this.load(change.projectId, false);
          return;
        }
        refreshOne(
          change.milestoneId,
          change.removed,
          (id) => this.projectsApi.getMilestone(change.projectId, id),
          (update) =>
            this.project.update((p) =>
              p ? { ...p, milestones: update(p.milestones) } : p,
            ),
          byOrder,
        );
        if (!change.removed) this.flash(change.milestoneId);
      });
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        this.load(this.id(), false);
        this.loadBilling(this.id());
      });
    // A newly sent invoice changes the money picture.
    this.realtime.notifications$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((n) => {
        if (n.kind === 'invoice_sent') this.loadBilling(this.id());
      });

    if (this.permission()?.viewDocuments) {
      this.documentsLoading.set(true);
      this.documentsApi.list({ take: 100 }).subscribe({
        next: (res) => {
          this.documents.set(res.results);
          this.documentsLoading.set(false);
        },
        error: () => this.documentsLoading.set(false),
      });
    }
  }

  /** Invoices, payments and the financial position for this project. */
  private loadBilling(id: string): void {
    if (!this.permission()?.viewPayments) return;
    this.billingLoading.set(true);
    this.projectsApi.financials(id).subscribe({
      next: (f) => this.financials.set(f),
      error: () => this.financials.set(null),
    });
    this.invoicesApi.list({ projectId: id, take: 100 }).subscribe({
      next: (res) => {
        this.invoices.set(res.results);
        this.billingLoading.set(false);
      },
      error: () => this.billingLoading.set(false),
    });
    this.paymentsApi.list({ projectId: id, take: 100 }).subscribe({
      next: (res) => this.payments.set(res.results),
      error: () => undefined,
    });
  }

  protected openInvoice(invoice: Invoice): void {
    this.dialogService.open(InvoiceDetailDialog, {
      contentClass: 'sm:max-w-xl',
      context: { invoice },
    });
  }

  /** From the "next payment due" callout - the invoice may already be loaded. */
  protected openInvoiceById(id: string): void {
    const loaded = this.invoices().find((i) => i.id === id);
    if (loaded) {
      this.openInvoice(loaded);
      return;
    }
    this.invoicesApi.get(id).subscribe((inv) => this.openInvoice(inv));
  }

  private load(id: string, showLoading: boolean): void {
    if (showLoading) this.loading.set(true);
    this.projectsApi.get(id).subscribe({
      next: (project) => {
        this.project.set(project);
        this.loading.set(false);
      },
      error: () => {
        // A live refresh that fails (e.g. the project was just unshared)
        // keeps what is on screen rather than blanking it.
        if (showLoading) this.project.set(null);
        this.loading.set(false);
      },
    });
  }

  private flash(id: string): void {
    this.fresh.update((s) => new Set(s).add(id));
    setTimeout(
      () =>
        this.fresh.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        }),
      2500,
    );
  }

  /**
   * A milestone waiting on the client opens its review; anything else jumps
   * to it on the Milestones tab.
   */
  protected openReview(m: ProjectMilestone): void {
    if (m.status === 'delivered') {
      this.openReviewDialog(m);
      return;
    }
    this.tab.set('milestones');
    queueMicrotask(() =>
      document
        .getElementById(`milestone-${m.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  }

  protected openReviewDialog(m: ProjectMilestone): void {
    const project = this.project();
    if (!project) return;
    const ref = this.dialogService.open(MilestoneReviewDialog, {
      contentClass: 'sm:max-w-3xl',
      context: {
        projectId: project.id,
        projectName: project.name,
        milestone: m,
        index: project.milestones.findIndex((x) => x.id === m.id),
        currency: this.auth.currency(),
        retentionPercent: this.retentionPercent(),
        canApprove: this.auth.me()?.canApproveMilestones ?? false,
        documents: new Map(this.documents().map((d) => [d.id, d])),
      } satisfies MilestoneReviewContext,
    });
    ref.closed$.subscribe((result) => {
      const r = result as MilestoneReviewResult | undefined;
      if (!r) return;
      // The live push refreshes too; reload now so the change is instant.
      this.load(project.id, false);
      this.loadBilling(project.id);
      if (r === 'approved') {
        this.toast.success('Milestone approved', `"${m.name}" is signed off.`);
      } else {
        this.toast.success('Feedback sent', 'The team will hand it over again once the changes are made.');
      }
    });
  }

  /** The client's latest review round on a milestone, if any. */
  protected latestReview(m: ProjectMilestone) {
    return m.reviews?.length ? m.reviews[m.reviews.length - 1] : null;
  }

  protected download(doc: DocumentItem): void {
    this.documentsApi.download(doc.id).subscribe((blob) => {
      saveBlob(blob, doc.name);
    });
  }
}
