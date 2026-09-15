import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload } from '@ng-icons/lucide';
import { injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { DocumentItem, DocumentsApiService } from '../../domains/documents';
import { isoDay } from '@foundry/shared-util';
import { saveBlob } from '../../core/download-file';

export interface DocumentDetailDialogContext {
  document: DocumentItem;
}

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
  selector: 'app-document-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmDialogImports, HlmButton, HlmSeparator],
  providers: [provideIcons({ lucideDownload })],
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle class="pr-6 text-base">{{ document.name }}</h3>
      <p hlmDialogDescription>
        {{ typeLabel[document.type] }} · {{ fmtSize(document.size) }}
      </p>
    </div>

    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
      <div>
        <dt class="text-muted-foreground">Shared on</dt>
        <dd class="mt-0.5 font-medium">{{ isoDay(document.uploadedAt) }}</dd>
      </div>
      <div>
        <dt class="text-muted-foreground">Size</dt>
        <dd class="mt-0.5 font-medium">{{ fmtSize(document.size) }}</dd>
      </div>
    </dl>

    <hr hlmSeparator />

    <div class="flex items-center justify-end">
      <button
        hlmBtn
        size="sm"
        type="button"
        class="gap-1.5"
        (click)="download()"
      >
        <ng-icon name="lucideDownload" size="14" /> Download
      </button>
    </div>
  `,
})
export class DocumentDetailDialog {
  protected readonly ctx =
    injectBrnDialogContext<DocumentDetailDialogContext>();
  private readonly documentsApi = inject(DocumentsApiService);

  protected readonly isoDay = isoDay;
  protected readonly fmtSize = fmtSize;
  protected readonly typeLabel = typeLabel;

  protected readonly document = this.ctx.document;

  protected download(): void {
    this.documentsApi.download(this.document.id).subscribe((blob) => {
      saveBlob(blob, this.document.name);
    });
  }
}
