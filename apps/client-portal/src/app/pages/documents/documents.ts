import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFile,
  lucideFileCheck2,
  lucideFileSignature,
  lucideFileText,
} from '@ng-icons/lucide';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { DocumentItem, DocumentsApiService } from '../../domains/documents';
import { isoDay } from '@foundry/shared-util';
import { EmptyState } from '@foundry/shared-ui';
import { DocumentDetailDialog } from './document-detail-dialog';

const typeIcon: Record<string, string> = {
  contract: 'lucideFileSignature',
  nda: 'lucideFileCheck2',
  receipt: 'lucideFileText',
  report: 'lucideFileText',
  other: 'lucideFile',
};

const typeLabel: Record<string, string> = {
  contract: 'Contract',
  nda: 'NDA',
  receipt: 'Receipt',
  report: 'Report',
  other: 'Document',
};

function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

@Component({
  selector: 'app-portal-documents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, EmptyState],
  providers: [
    provideIcons({
      lucideFile,
      lucideFileCheck2,
      lucideFileSignature,
      lucideFileText,
    }),
  ],
  templateUrl: './documents.html',
})
export class Documents {
  private readonly documentsApi = inject(DocumentsApiService);
  private readonly dialogService = inject(HlmDialogService);

  protected readonly fmtSize = fmtSize;
  protected readonly isoDay = isoDay;
  protected readonly typeIcon = typeIcon;
  protected readonly typeLabel = typeLabel;

  protected readonly loading = signal(true);
  protected readonly documents = signal<DocumentItem[]>([]);

  constructor() {
    this.documentsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.documents.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected open(document: DocumentItem): void {
    this.dialogService.open(DocumentDetailDialog, {
      contentClass: 'sm:max-w-lg',
      context: { document },
    });
  }
}
