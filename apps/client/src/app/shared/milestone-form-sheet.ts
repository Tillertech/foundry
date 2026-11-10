import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePaperclip, lucidePlus, lucideReceipt, lucideUpload, lucideX } from '@ng-icons/lucide';
import { ApiDocument, DocumentsApiService } from '../domains/documents';
import { BrnAlertDialogContent } from '@spartan-ng/brain/alert-dialog';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import {
  apiErrorMessage,
  Currency,
  isoDay,
  money,
  newId,
  num,
  toApiDate,
} from '@foundry/shared-util';
import {
  CreateMilestoneRequest,
  Milestone,
  MilestoneBillingTrigger,
  MilestoneDeliverable,
  MilestoneStatus,
  MilestonesApiService,
} from '../domains/milestones';
import {
  AutocompleteOption,
  Field,
  OptionAutocomplete,
  ToastService,
} from '@foundry/shared-ui';
import { DateField } from './date-field';
import { EntitySheet } from './entity-sheet';

interface MilestoneForm {
  name: string;
  description: string;
  status: MilestoneStatus;
  dueDate: string;
  estimatedHours: number;
  notes: string;
  /** null = not billed per milestone. */
  amount: number | null;
  billingTrigger: MilestoneBillingTrigger;
  releasesRetention: boolean;
  deliverables: MilestoneDeliverable[];
  acceptanceCriteria: string;
  acceptedBy: string;
}

const emptyForm = (): MilestoneForm => ({
  name: '',
  description: '',
  status: 'not_started',
  dueDate: '',
  estimatedHours: 0,
  notes: '',
  amount: null,
  billingTrigger: 'on_acceptance',
  releasesRetention: false,
  deliverables: [],
  acceptanceCriteria: '',
  acceptedBy: '',
});

export const milestoneStatusLabels: Record<MilestoneStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  delivered: 'Delivered',
  accepted: 'Accepted',
  completed: 'Completed',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
};

export const billingTriggerLabels: Record<MilestoneBillingTrigger, string> = {
  on_acceptance: 'When the client signs off',
  upfront: 'Upfront, before the work',
  manual: 'Manually',
};

/**
 * Add/edit milestone - a side drawer like every other create/edit form in
 * the app, rather than an inline expand within the list.
 */
@Component({
  selector: 'app-milestone-form-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    BrnAlertDialogContent,
    HlmAlertDialogImports,
    HlmCheckboxImports,
    HlmInput,
    HlmSelectImports,
    HlmSwitchImports,
    HlmTextarea,
    DateField,
    EntitySheet,
    Field,
    OptionAutocomplete,
  ],
  providers: [provideIcons({ lucidePaperclip, lucidePlus, lucideReceipt, lucideUpload, lucideX })],
  templateUrl: './milestone-form-sheet.html',
})
export class MilestoneFormSheet {
  private readonly api = inject(MilestonesApiService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();
  /** null = create mode. */
  readonly milestone = input<Milestone | null>(null);
  /** The project's client currency, for the price field. */
  readonly currency = input<Currency>('USD');
  /** Project retention percent, shown next to the final-milestone switch. */
  readonly retentionPercent = input(0);
  /** Project files that can be attached to deliverables as evidence. */
  readonly documents = input<{ id: string; name: string }[]>([]);
  /** The project's client - new evidence uploads are filed under both. */
  readonly clientId = input<string | null>(null);
  /** A file uploaded from here, so the host can add it to its Files list. */
  readonly documentUploaded = output<ApiDocument>();

  private readonly documentsApi = inject(DocumentsApiService);
  /** Uploaded in this sheet but maybe not in `documents` yet (host updates async). */
  private readonly uploaded = signal<{ id: string; name: string }[]>([]);
  /** Deliverable currently uploading a file. */
  protected readonly uploadingFor = signal<string | null>(null);
  /** Project files plus anything just uploaded here. */
  private readonly allDocuments = computed(() => {
    const seen = new Set(this.documents().map((d) => d.id));
    return [...this.documents(), ...this.uploaded().filter((d) => !seen.has(d.id))];
  });

  /** Deliverable whose evidence panel is open. */
  protected readonly openEvidence = signal<string | null>(null);
  /** Bound to the attach picker, reset after each pick. */
  protected readonly attachPick = signal('');
  readonly open = model(false);
  readonly saved = output<Milestone>();
  readonly deleted = output<string>();

  protected readonly saving = signal(false);
  protected readonly draft = signal<MilestoneForm>(emptyForm());

  protected readonly statusOptions = Object.entries(milestoneStatusLabels) as [
    MilestoneStatus,
    string,
  ][];
  protected readonly statusLabel = (v: string) =>
    milestoneStatusLabels[v as MilestoneStatus] ?? v;
  protected readonly triggerOptions = Object.entries(billingTriggerLabels) as [
    MilestoneBillingTrigger,
    string,
  ][];
  protected readonly triggerLabel = (v: string) =>
    billingTriggerLabels[v as MilestoneBillingTrigger] ?? v;
  /** Text of the "add deliverable" input. */
  protected readonly newDeliverable = signal('');

  protected get isNew(): boolean {
    return !this.milestone();
  }

  constructor() {
    // Reset the draft from the given milestone (or fresh defaults) every
    // time the sheet opens.
    effect(() => {
      const isOpen = this.open();
      if (!isOpen) return;
      const m = untracked(() => this.milestone());
      this.draft.set(
        m
          ? {
              name: m.name,
              description: m.description ?? '',
              status: m.status,
              dueDate: m.dueDate ? isoDay(m.dueDate) : '',
              estimatedHours: m.estimatedHours ?? 0,
              notes: m.notes ?? '',
              amount: m.amount === null ? null : num(m.amount),
              billingTrigger: m.billingTrigger,
              releasesRetention: m.releasesRetention,
              deliverables: m.deliverables.map((d) => ({
                ...d,
                links: d.links?.map((l) => ({ ...l })),
                documentIds: d.documentIds ? [...d.documentIds] : undefined,
              })),
              acceptanceCriteria: m.acceptanceCriteria ?? '',
              acceptedBy: m.acceptedBy ?? '',
            }
          : emptyForm(),
      );
      this.newDeliverable.set('');
    });
  }

  protected patch(p: Partial<MilestoneForm>): void {
    this.draft.update((v) => ({ ...v, ...p }));
  }

  /** Status move awaiting confirmation (delivered / accepted), if any. */
  protected readonly confirmMove = signal<'delivered' | 'accepted' | null>(null);

  /** What confirming an acceptance will bill, for the dialog copy. */
  protected readonly acceptanceBills = computed(() => {
    const v = this.draft();
    return (
      v.amount !== null &&
      v.amount > 0 &&
      v.billingTrigger === 'on_acceptance' &&
      !this.milestone()?.invoice
    );
  });

  /**
   * Hand-over and sign-off reach the client (portal notification) and
   * sign-off can raise an invoice, so moving into either asks first.
   */
  protected save(): void {
    const v = this.draft();
    if (!v.name.trim() || this.saving()) return;
    const from = this.milestone()?.status ?? null;
    if ((v.status === 'delivered' || v.status === 'accepted') && v.status !== from) {
      this.confirmMove.set(v.status);
      return;
    }
    this.persist();
  }

  protected confirmSave(ctx: { close: () => void }): void {
    ctx.close();
    this.confirmMove.set(null);
    this.persist();
  }

  private persist(): void {
    const v = this.draft();
    if (!v.name.trim() || this.saving()) return;
    const current = this.milestone();
    const common = {
      name: v.name.trim(),
      description: v.description.trim() || undefined,
      status: v.status,
      dueDate: v.dueDate ? toApiDate(v.dueDate) : undefined,
      estimatedHours: v.estimatedHours || undefined,
      notes: v.notes.trim() || undefined,
      amount: v.amount,
      billingTrigger: v.billingTrigger,
      releasesRetention: v.releasesRetention,
      deliverables: this.pendingDeliverables(),
      acceptanceCriteria: v.acceptanceCriteria.trim() || undefined,
      acceptedBy:
        v.status === 'accepted' ? v.acceptedBy.trim() || undefined : undefined,
    };
    this.saving.set(true);
    const request = current
      ? this.api.update(current.id, common)
      : this.api.create({
          ...common,
          projectId: this.projectId(),
        } as CreateMilestoneRequest);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.open.set(false);
        this.saved.emit(saved);
        if (saved.invoice && !current?.invoice) {
          this.toast.success(
            'Milestone accepted',
            `Draft invoice ${saved.invoice.number} is ready to send.`,
          );
        } else {
          this.toast.success(current ? 'Milestone updated' : 'Milestone added');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save milestone', apiErrorMessage(err));
      },
    });
  }

  protected readonly money = money;

  protected amountInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.patch({ amount: v === '' ? null : Math.max(0, Number(v) || 0) });
  }

  protected addDeliverable(): void {
    const label = this.newDeliverable().trim();
    if (!label) return;
    this.patch({
      deliverables: [
        ...this.draft().deliverables,
        { id: newId(), label, done: false },
      ],
    });
    this.newDeliverable.set('');
  }

  protected updateDeliverable(
    id: string,
    patch: Partial<MilestoneDeliverable>,
  ): void {
    this.patch({
      deliverables: this.draft().deliverables.map((d) =>
        d.id === id ? { ...d, ...patch } : d,
      ),
    });
  }

  protected removeDeliverable(id: string): void {
    this.patch({
      deliverables: this.draft().deliverables.filter((d) => d.id !== id),
    });
  }

  /** Saved list, including a typed-but-not-added item so it isn't lost. */
  private pendingDeliverables(): MilestoneDeliverable[] {
    const list = this.draft()
      .deliverables.map((d) => ({
        ...d,
        label: d.label.trim(),
        note: d.note?.trim() || undefined,
        // Half-filled link rows are dropped rather than failing the save.
        links: (d.links ?? [])
          .map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() }))
          .filter((l) => /^https?:\/\/\S+$/i.test(l.url)),
      }))
      .filter((d) => d.label);
    const typed = this.newDeliverable().trim();
    return typed ? [...list, { id: newId(), label: typed, done: false }] : list;
  }

  protected toggleEvidence(id: string): void {
    this.openEvidence.update((cur) => (cur === id ? null : id));
  }

  protected evidenceCount(d: MilestoneDeliverable): number {
    return (d.links?.length ?? 0) + (d.documentIds?.length ?? 0) + (d.note?.trim() ? 1 : 0);
  }

  protected addLink(id: string): void {
    const d = this.draft().deliverables.find((x) => x.id === id);
    this.updateDeliverable(id, { links: [...(d?.links ?? []), { label: '', url: '' }] });
  }

  protected updateLink(id: string, index: number, patch: Partial<{ label: string; url: string }>): void {
    const d = this.draft().deliverables.find((x) => x.id === id);
    this.updateDeliverable(id, {
      links: (d?.links ?? []).map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  }

  protected removeLink(id: string, index: number): void {
    const d = this.draft().deliverables.find((x) => x.id === id);
    this.updateDeliverable(id, { links: (d?.links ?? []).filter((_, i) => i !== index) });
  }

  protected documentName(docId: string): string {
    return this.allDocuments().find((doc) => doc.id === docId)?.name ?? 'File';
  }

  /**
   * Uploads straight from the deliverable: filed under the project (and its
   * client) like any project file, then attached here - no trip to Files.
   */
  protected uploadEvidence(deliverableId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploadingFor()) return;
    this.uploadingFor.set(deliverableId);
    this.documentsApi
      .create(file, {
        projectId: this.projectId(),
        clientId: this.clientId() ?? undefined,
      })
      .subscribe({
        next: (doc) => {
          this.uploadingFor.set(null);
          this.uploaded.update((list) => [...list, { id: doc.id, name: doc.name }]);
          this.documentUploaded.emit(doc);
          this.attachDocument(deliverableId, doc.id);
          this.toast.success('File attached', `${doc.name} was added to the project files too.`);
        },
        error: (err) => {
          this.uploadingFor.set(null);
          this.toast.error('Could not upload file', apiErrorMessage(err));
        },
      });
  }

  protected documentOptions(d: MilestoneDeliverable): AutocompleteOption[] {
    const taken = new Set(d.documentIds ?? []);
    return this.allDocuments()
      .filter((doc) => !taken.has(doc.id))
      .map((doc) => ({ value: doc.id, label: doc.name }));
  }

  protected attachDocument(id: string, docId: string): void {
    if (!docId) return;
    const d = this.draft().deliverables.find((x) => x.id === id);
    const ids = new Set(d?.documentIds ?? []);
    ids.add(docId);
    this.updateDeliverable(id, { documentIds: [...ids] });
    // Clear the picker for the next file.
    this.attachPick.set(docId);
    queueMicrotask(() => this.attachPick.set(''));
  }

  protected detachDocument(id: string, docId: string): void {
    const d = this.draft().deliverables.find((x) => x.id === id);
    this.updateDeliverable(id, { documentIds: (d?.documentIds ?? []).filter((x) => x !== docId) });
  }

  protected doneCount(): number {
    return this.draft().deliverables.filter((d) => d.done).length;
  }

  protected removeCurrent(): void {
    const current = this.milestone();
    if (!current) return;
    this.api.delete(current.id).subscribe({
      next: () => {
        this.open.set(false);
        this.deleted.emit(current.id);
        this.toast.deleted('Milestone');
      },
      error: (err) =>
        this.toast.error('Could not delete milestone', apiErrorMessage(err)),
    });
  }
}
