import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFileText,
  lucideLoaderCircle,
  lucidePaperclip,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { toast } from '@spartan-ng/brain/sonner';
import { apiErrorMessage, fileSize } from '@foundry/shared-util';
import { AutocompleteOption, OptionAutocomplete } from '@foundry/shared-ui';
import { ApiDocument, DocumentsApiService } from '../../domains/documents';
import { QuoteAttachment } from '../../domains/quotes';

/** Combined cap on a quote's attachments (emailed together). */
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export type QuoteAttachmentDoc = QuoteAttachment['document'];

/**
 * Supporting files sent with a quote - MSA, spec, wireframes. Picks from the
 * client's existing documents or uploads a new one (filed under the client,
 * so it also shows in Documents). The scope itself stays on the milestone
 * lines; these back it up. Locked together with the lines.
 */
@Component({
  selector: 'app-quote-attachments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [NgIcon, HlmButton, OptionAutocomplete],
  providers: [
    provideIcons({
      lucideFileText,
      lucideLoaderCircle,
      lucidePaperclip,
      lucideUpload,
      lucideX,
    }),
  ],
  template: `
    @if (attachments().length) {
      <ul class="-mx-1 mb-2 grid gap-0.5">
        @for (a of attachments(); track a.id) {
          <li class="group/a flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50">
            <ng-icon name="lucideFileText" size="14" class="shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px]">{{ a.name }}</span>
              <span class="block text-[11px] text-muted-foreground">{{ size(a.size) }}</span>
            </span>
            @if (!locked()) {
              <button
                type="button"
                class="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 sm:opacity-0 sm:group-hover/a:opacity-100 sm:focus-visible:opacity-100"
                (click)="remove(a.id)"
                [attr.aria-label]="'Remove ' + a.name"
              >
                <ng-icon name="lucideX" size="13" />
              </button>
            }
          </li>
        }
      </ul>
      <p class="mb-2 text-[11px] text-muted-foreground">
        {{ size(total()) }} of {{ size(maxBytes) }} combined
      </p>
    }

    @if (!locked()) {
      <div class="grid gap-1.5">
        <app-option-autocomplete
          class="min-w-0"
          [placeholder]="placeholder()"
          emptyText="No document found"
          [disabled]="!clientId() || !options().length"
          [options]="options()"
          [value]="''"
          (valueChange)="attach($event)"
        />
        <input #file type="file" class="hidden" (change)="upload(file)" />
        <button
          hlmBtn
          type="button"
          variant="ghost"
          size="sm"
          class="h-8 justify-start gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          [disabled]="!clientId() || uploading()"
          (click)="file.click()"
        >
          <ng-icon
            [name]="uploading() ? 'lucideLoaderCircle' : 'lucideUpload'"
            size="13"
            [class.animate-spin]="uploading()"
          />
          {{ uploading() ? 'Uploading…' : 'Upload a file' }}
        </button>
      </div>
    } @else if (!attachments().length) {
      <p class="text-xs text-muted-foreground">No attachments.</p>
    }
  `,
})
export class QuoteAttachments {
  private readonly documentsApi = inject(DocumentsApiService);

  readonly clientId = input.required<string>();
  readonly attachments = input.required<QuoteAttachmentDoc[]>();
  readonly locked = input(false);
  readonly attachmentsChange = output<QuoteAttachmentDoc[]>();

  private readonly clientDocs = signal<ApiDocument[]>([]);
  protected readonly uploading = signal(false);

  protected readonly placeholder = computed(() =>
    !this.clientId()
      ? 'Pick a client first'
      : this.options().length
        ? "Attach a client document…"
        : 'No other documents for this client yet',
  );

  /** The client's documents not already attached. */
  protected readonly options = computed<AutocompleteOption[]>(() => {
    const attached = new Set(this.attachments().map((a) => a.id));
    return this.clientDocs()
      .filter((d) => !attached.has(d.id))
      .map((d) => ({ value: d.id, label: d.name, hint: fileSize(d.size) }));
  });

  constructor() {
    effect((onCleanup) => {
      const clientId = this.clientId();
      this.clientDocs.set([]);
      if (!clientId || this.locked()) return;
      const sub = this.documentsApi.list({ clientId, take: 100 }).subscribe({
        next: (res) => this.clientDocs.set(res.results),
        error: () => undefined,
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected attach(id: string): void {
    const doc = this.clientDocs().find((d) => d.id === id);
    if (!doc || this.attachments().some((a) => a.id === id)) return;
    if (this.overLimit(doc.size)) return;
    this.attachmentsChange.emit([...this.attachments(), toAttachment(doc)]);
  }

  protected remove(id: string): void {
    this.attachmentsChange.emit(this.attachments().filter((a) => a.id !== id));
  }

  /** Files it under the client (so it's in Documents too), then attaches it. */
  protected upload(field: HTMLInputElement): void {
    const file = field.files?.[0];
    field.value = '';
    if (!file || !this.clientId()) return;
    if (this.overLimit(file.size)) return;
    this.uploading.set(true);
    this.documentsApi.create(file, { clientId: this.clientId() }).subscribe({
      next: (doc) => {
        this.uploading.set(false);
        this.clientDocs.update((list) => [doc, ...list]);
        this.attachmentsChange.emit([...this.attachments(), toAttachment(doc)]);
      },
      error: (err) => {
        this.uploading.set(false);
        toast.error('Could not upload the file', {
          description: apiErrorMessage(err),
        });
      },
    });
  }

  protected readonly size = fileSize;
  protected readonly maxBytes = MAX_TOTAL_BYTES;
  protected readonly total = computed(() =>
    this.attachments().reduce((sum, a) => sum + a.size, 0),
  );

  private overLimit(bytes: number): boolean {
    if (this.total() + bytes <= MAX_TOTAL_BYTES) return false;
    toast.error('Attachments too large', {
      description: `A quote's files can total at most ${fileSize(MAX_TOTAL_BYTES)} combined.`,
    });
    return true;
  }
}

const toAttachment = (d: ApiDocument): QuoteAttachmentDoc => ({
  id: d.id,
  name: d.name,
  mimeType: d.mimeType,
  size: d.size,
});
