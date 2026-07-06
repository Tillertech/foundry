import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';
import { BrnAlertDialogContent } from '@spartan-ng/brain/alert-dialog';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';

/**
 * Right-hand CRUD panel ported from the project-flow EntitySheet:
 * full-width on mobile, capped at sm:max-w-xl on larger screens.
 */
@Component({
  selector: 'app-entity-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmSheetImports, BrnSheetContent, HlmAlertDialogImports, BrnAlertDialogContent],
  providers: [provideIcons({ lucideTrash2 })],
  template: `
    <hlm-sheet side="right" [state]="open() ? 'open' : 'closed'" (closed)="open.set(false)">
      <hlm-sheet-content
        *brnSheetContent="let ctx"
        class="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <div hlmSheetHeader class="border-b border-border px-6 py-4 text-left">
          <h3 hlmSheetTitle class="text-base font-semibold">{{ title() }}</h3>
          @if (description()) {
            <p hlmSheetDescription class="text-xs">{{ description() }}</p>
          }
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          <ng-content />
        </div>

        <div
          hlmSheetFooter
          class="flex-row items-center justify-between gap-2 border-t border-border px-6 py-3"
        >
          <div>
            @if (showDelete()) {
              <hlm-alert-dialog>
                <button
                  hlmAlertDialogTrigger
                  hlmBtn
                  variant="ghost"
                  size="sm"
                  class="gap-1.5 text-destructive hover:text-destructive"
                >
                  <ng-icon name="lucideTrash2" size="16" />
                  Delete
                </button>
                <hlm-alert-dialog-content *brnAlertDialogContent="let dialogCtx">
                  <div hlmAlertDialogHeader>
                    <h3 hlmAlertDialogTitle>Delete this record?</h3>
                    <p hlmAlertDialogDescription>
                      This can't be undone. The record will be permanently removed.
                    </p>
                  </div>
                  <div hlmAlertDialogFooter>
                    <button hlmAlertDialogCancel (click)="dialogCtx.close()">Cancel</button>
                    <button
                      hlmAlertDialogAction
                      class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      (click)="confirmDelete(dialogCtx)"
                    >
                      Delete
                    </button>
                  </div>
                </hlm-alert-dialog-content>
              </hlm-alert-dialog>
            }
          </div>
          <div class="flex items-center gap-2">
            <button hlmBtn variant="ghost" size="sm" (click)="open.set(false)">Cancel</button>
            <button
              hlmBtn
              size="sm"
              class="shadow-[var(--shadow-glow)]"
              [disabled]="!canSave()"
              (click)="saved.emit()"
            >
              {{ saveLabel() }}
            </button>
          </div>
        </div>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
})
export class EntitySheet {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly saveLabel = input('Save');
  readonly canSave = input(true);
  readonly showDelete = input(false);

  readonly saved = output<void>();
  readonly deleted = output<void>();

  protected confirmDelete(ctx: { close: () => void }): void {
    ctx.close();
    this.deleted.emit();
  }
}
