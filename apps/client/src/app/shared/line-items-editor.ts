import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGripVertical, lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { Currency, InvoiceItem, money, newId } from '../core/store.service';

@Component({
  selector: 'app-line-items-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmInput],
  providers: [provideIcons({ lucideGripVertical, lucidePlus, lucideTrash2 })],
  template: `
    <div class="rounded-lg border border-border">
      <div
        class="hidden grid-cols-[16px_1fr_80px_100px_100px_32px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid"
      >
        <span></span>
        <span>Description</span>
        <span class="text-right">Qty</span>
        <span class="text-right">Rate</span>
        <span class="text-right">Amount</span>
        <span></span>
      </div>
      <div class="divide-y divide-border">
        @for (it of items(); track it.id) {
          <div
            class="grid grid-cols-[1fr_32px] items-center gap-2 px-3 py-2 sm:grid-cols-[16px_1fr_80px_100px_100px_32px]"
          >
            <span class="hidden sm:block">
              <ng-icon
                name="lucideGripVertical"
                size="14"
                class="text-muted-foreground"
              />
            </span>
            <input
              hlmInput
              [value]="it.description"
              (input)="
                update(it.id, { description: $any($event.target).value })
              "
              placeholder="Design sprint - week 3"
              class="col-start-1 h-8 w-full border-0 bg-transparent px-2 shadow-none focus-visible:bg-muted/60 sm:col-start-auto"
            />
            <button
              type="button"
              (click)="del(it.id)"
              class="col-start-2 row-start-1 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:order-last sm:col-start-auto sm:row-start-auto"
              aria-label="Remove line"
            >
              <ng-icon name="lucideTrash2" size="14" />
            </button>
            <div
              class="col-span-2 grid grid-cols-[80px_100px_1fr] items-center gap-2 sm:contents"
            >
              <input
                hlmInput
                type="number"
                min="0"
                step="0.01"
                [value]="it.quantity"
                (input)="update(it.id, { quantity: toNumber($event) })"
                class="h-8 w-full border-0 bg-transparent px-2 text-right shadow-none focus-visible:bg-muted/60"
                aria-label="Quantity"
              />
              <input
                hlmInput
                type="number"
                min="0"
                step="0.01"
                [value]="it.rate"
                (input)="update(it.id, { rate: toNumber($event) })"
                class="h-8 w-full border-0 bg-transparent px-2 text-right shadow-none focus-visible:bg-muted/60"
                aria-label="Rate"
              />
              <span class="text-right text-sm font-semibold tabular-nums">
                {{ amount(it) }}
              </span>
            </div>
          </div>
        }
      </div>
      <div class="border-t border-border p-2">
        <button
          hlmBtn
          type="button"
          variant="ghost"
          size="sm"
          (click)="add()"
          class="w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ng-icon name="lucidePlus" size="14" />
          Add line
        </button>
      </div>
    </div>
  `,
})
export class LineItemsEditor {
  readonly items = input.required<InvoiceItem[]>();
  readonly currency = input<Currency>('USD');
  readonly itemsChange = output<InvoiceItem[]>();

  protected update(id: string, patch: Partial<InvoiceItem>): void {
    this.itemsChange.emit(
      this.items().map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }

  protected add(): void {
    this.itemsChange.emit([
      ...this.items(),
      { id: newId(), description: '', quantity: 1, rate: 0 },
    ]);
  }

  protected del(id: string): void {
    this.itemsChange.emit(this.items().filter((it) => it.id !== id));
  }

  protected amount(it: InvoiceItem): string {
    return money(it.quantity * it.rate, this.currency());
  }

  protected toNumber(event: Event): number {
    return Number((event.target as HTMLInputElement).value) || 0;
  }
}
