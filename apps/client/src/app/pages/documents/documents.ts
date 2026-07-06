import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { DocumentItem, StoreService, newId } from '../../core/store.service';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';

const emptyDoc = (): DocumentItem => ({
  id: '',
  name: '',
  type: 'contract',
  clientId: '',
  projectId: '',
  size: 0,
  uploadedAt: new Date().toISOString().slice(0, 10),
  notes: '',
});

const typeLabels: Record<DocumentItem['type'], { label: string; icon: string }> = {
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
    DateField,
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
    }),
  ],
  templateUrl: './documents.html',
})
export class Documents {
  protected readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly typeFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected isNew = true;
  protected form: DocumentItem = emptyDoc();

  protected readonly typeOptions = Object.entries(typeLabels) as [
    DocumentItem['type'],
    { label: string; icon: string },
  ][];

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const type = this.typeFilter();
    return this.store
      .documents()
      .filter(
        (d) =>
          (type === 'all' || d.type === type) &&
          (!term || d.name.toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  });

  protected openNew(): void {
    this.form = { ...emptyDoc(), id: newId() };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(d: DocumentItem): void {
    this.form = { ...d };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.name.trim()) return;
    this.store.upsert('documents', { ...this.form, size: this.form.size || 250_000 });
    this.sheetOpen.set(false);
    if (this.isNew) this.toast.created('Document');
    else this.toast.updated('Document');
  }

  protected removeCurrent(): void {
    this.store.remove('documents', this.form.id);
    this.sheetOpen.set(false);
    this.toast.deleted('Document');
  }

  protected meta(type: DocumentItem['type']) {
    return typeLabels[type];
  }

  protected clientName(id: string | undefined): string {
    if (!id) return '';
    const c = this.store.clients().find((x) => x.id === id);
    return c?.company || c?.name || '';
  }

  protected fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
