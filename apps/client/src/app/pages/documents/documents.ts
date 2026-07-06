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
import {
  lucideChartColumn,
  lucideFileText,
  lucideFolderOpen,
  lucidePlus,
  lucideReceiptText,
  lucideSearch,
  lucideShieldCheck,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/http';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import {
  ApiDocument,
  CreateDocumentRequest,
  DocumentType,
  DocumentsApiService,
} from '../../domains/documents';
import { Project, ProjectsApiService } from '../../domains/projects';
import { isoDay } from '../../domains/shared';
import { ToastService } from '../../core/toast.service';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';

interface DocumentForm {
  id: string;
  name: string;
  type: DocumentType;
  clientId: string;
  projectId: string;
  notes: string;
}

const emptyDoc = (): DocumentForm => ({
  id: '',
  name: '',
  type: 'contract',
  clientId: '',
  projectId: '',
  notes: '',
});

const typeLabels: Record<DocumentType, { label: string; icon: string }> = {
  contract: { label: 'Contract', icon: 'lucideFileText' },
  nda: { label: 'NDA', icon: 'lucideShieldCheck' },
  receipt: { label: 'Receipt', icon: 'lucideReceiptText' },
  report: { label: 'Report', icon: 'lucideChartColumn' },
  other: { label: 'Other', icon: 'lucideFolderOpen' },
};

@Component({
  selector: 'app-documents',
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
  ],
  providers: [
    provideIcons({
      lucideChartColumn,
      lucideFileText,
      lucideFolderOpen,
      lucidePlus,
      lucideReceiptText,
      lucideSearch,
      lucideShieldCheck,
      lucideUpload,
    }),
  ],
  templateUrl: './documents.html',
})
export class Documents {
  private readonly documentsApi = inject(DocumentsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly documents = signal<ApiDocument[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);
  protected readonly projects = signal<Project[]>([]);

  protected readonly query = signal('');
  protected readonly typeFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly selectedFile = signal<File | null>(null);
  protected isNew = true;
  protected form: DocumentForm = emptyDoc();

  protected readonly typeOptions = Object.entries(typeLabels) as [
    DocumentType,
    { label: string; icon: string },
  ][];

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.refresh();
  }

  private refresh(): void {
    this.documentsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.documents.set(res.results);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load documents', apiErrorMessage(err));
      },
    });
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });
    this.projectsApi.list({ take: 100 }).subscribe({
      next: (res) => this.projects.set(res.results),
      error: () => undefined,
    });
  }

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const type = this.typeFilter();
    return this.documents()
      .filter(
        (d) =>
          (type === 'all' || d.type === type) &&
          (!term || d.name.toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  });

  protected openNew(): void {
    this.form = emptyDoc();
    this.selectedFile.set(null);
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(d: ApiDocument): void {
    this.form = {
      id: d.id,
      name: d.name,
      type: d.type,
      clientId: d.clientId ?? '',
      projectId: d.projectId ?? '',
      notes: d.notes ?? '',
    };
    this.selectedFile.set(null);
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedFile.set(file);
    if (file && !this.form.name.trim()) this.form.name = file.name;
  }

  protected canSave(): boolean {
    if (this.saving()) return false;
    return this.isNew ? this.selectedFile() !== null : !!this.form.name.trim();
  }

  protected save(): void {
    if (!this.canSave()) return;
    const meta: CreateDocumentRequest = {
      name: this.form.name.trim() || undefined,
      type: this.form.type,
      clientId: this.form.clientId || undefined,
      projectId: this.form.projectId || undefined,
      notes: this.form.notes.trim() || undefined,
    };
    this.saving.set(true);
    const request = this.isNew
      ? // Single multipart call: the file plus its metadata.
        this.documentsApi.create(this.selectedFile() as File, meta)
      : this.documentsApi.update(this.form.id, meta);
    request.subscribe({
      next: (doc) => {
        this.saving.set(false);
        this.documents.update((list) =>
          this.isNew
            ? [doc, ...list]
            : list.map((d) => (d.id === doc.id ? doc : d)),
        );
        this.sheetOpen.set(false);
        if (this.isNew) this.toast.success('Document uploaded', doc.name);
        else this.toast.updated('Document');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save document', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.form.id;
    this.documentsApi.delete(id).subscribe({
      next: () => {
        this.documents.update((list) => list.filter((d) => d.id !== id));
        this.sheetOpen.set(false);
        this.toast.deleted('Document');
      },
      error: (err) =>
        this.toast.error('Could not delete document', apiErrorMessage(err)),
    });
  }

  protected meta(type: DocumentType) {
    return typeLabels[type];
  }

  protected clientName(id: string | null | undefined): string {
    if (!id) return '';
    const c = this.clients().find((x) => x.id === id);
    return c?.company || c?.name || '';
  }

  protected fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected readonly day = isoDay;
}
