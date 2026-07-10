import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell, lucideCheckCheck } from '@ng-icons/lucide';
import { interval } from 'rxjs';
import {
  AppNotification,
  NotificationsApiService,
} from '../domains/notifications';

/**
 * Header bell: unread badge plus a dropdown of the latest in-app
 * notifications (emailed invoices/quotes/documents, settlements, reminders).
 * The count refreshes on a slow poll; the list refreshes on open.
 */
@Component({
  selector: 'app-notifications-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [provideIcons({ lucideBell, lucideCheckCheck })],
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggle()"
        class="relative grid h-9 w-9 place-items-center rounded-md text-foreground transition-colors hover:bg-muted"
        aria-label="Notifications"
        [attr.aria-expanded]="open()"
      >
        <ng-icon name="lucideBell" size="18" />
        @if (unread() > 0) {
          <span
            class="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
          >
            {{ unread() > 9 ? '9+' : unread() }}
          </span>
        }
      </button>

      @if (open()) {
        <button
          type="button"
          class="fixed inset-0 z-30 cursor-default"
          (click)="close()"
          aria-label="Close notifications"
        ></button>
        <div
          class="fixed inset-x-3 top-16 z-40 overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[340px]"
        >
          <div
            class="flex items-center justify-between border-b border-border px-4 py-2.5"
          >
            <span class="text-sm font-semibold">Notifications</span>
            @if (unread() > 0) {
              <button
                type="button"
                (click)="markAllRead()"
                class="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <ng-icon name="lucideCheckCheck" size="13" />
                Mark all read
              </button>
            }
          </div>
          <div class="max-h-[60vh] overflow-y-auto sm:max-h-[380px]">
            @if (loading()) {
              <p class="px-4 py-6 text-center text-xs text-muted-foreground">
                Loading…
              </p>
            } @else if (notifications().length === 0) {
              <p class="px-4 py-6 text-center text-xs text-muted-foreground">
                Nothing yet - sent invoices, quotes and shared documents show up
                here.
              </p>
            } @else {
              @for (n of notifications(); track n.id) {
                <button
                  type="button"
                  (click)="markRead(n)"
                  class="flex w-full items-start gap-2.5 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <span
                    class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    [class]="n.readAt ? 'bg-border' : 'bg-primary'"
                  ></span>
                  <span class="min-w-0">
                    <span class="block truncate text-[13px] font-medium">
                      {{ n.title }}
                    </span>
                    <span
                      class="mt-0.5 block text-xs leading-snug text-muted-foreground"
                    >
                      {{ n.body }}
                    </span>
                    <span
                      class="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70"
                    >
                      {{ age(n) }}
                    </span>
                  </span>
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationsMenu {
  private readonly api = inject(NotificationsApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly unread = signal(0);
  protected readonly notifications = signal<AppNotification[]>([]);

  constructor() {
    this.refreshCount();
    interval(60_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshCount());
  }

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) this.refreshList();
  }

  protected close(): void {
    this.open.set(false);
  }

  protected markRead(n: AppNotification): void {
    if (n.readAt) return;
    this.api.markRead(n.id).subscribe({
      next: (updated) => {
        this.notifications.update((list) =>
          list.map((x) => (x.id === updated.id ? updated : x)),
        );
        this.unread.update((c) => Math.max(0, c - 1));
      },
      error: () => undefined,
    });
  }

  protected markAllRead(): void {
    this.api.markAllRead().subscribe({
      next: () => {
        this.unread.set(0);
        const now = new Date().toISOString();
        this.notifications.update((list) =>
          list.map((n) => ({ ...n, readAt: n.readAt ?? now })),
        );
      },
      error: () => undefined,
    });
  }

  protected age(n: AppNotification): string {
    const minutes = Math.floor(
      (Date.now() - new Date(n.createdAt).getTime()) / 60_000,
    );
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  private refreshCount(): void {
    this.api.unreadCount().subscribe({
      next: (res) => this.unread.set(res.count),
      error: () => undefined,
    });
  }

  private refreshList(): void {
    this.loading.set(true);
    this.api.list({ take: 15 }).subscribe({
      next: (res) => {
        this.notifications.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
