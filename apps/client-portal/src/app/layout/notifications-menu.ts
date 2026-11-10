import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideBell,
  lucideCheckCheck,
  lucideFileSignature,
  lucideFileText,
  lucideFolderOpen,
  lucidePackageCheck,
  lucidePlay,
} from '@ng-icons/lucide';
import { ToastService } from '@foundry/shared-ui';
import { PortalAuthService } from '../domains/auth';
import {
  PortalNotification,
  PortalNotificationKind,
  PortalNotificationsApiService,
} from '../domains/notifications';
import { PortalRealtimeService } from '../domains/realtime';

const KIND_ICON: Record<PortalNotificationKind, string> = {
  quote_sent: 'lucideFileSignature',
  invoice_sent: 'lucideFileText',
  document_shared: 'lucideFolderOpen',
  milestone_started: 'lucidePlay',
  milestone_delivered: 'lucidePackageCheck',
  milestone_accepted: 'lucideBadgeCheck',
};

/**
 * Header bell for portal users: unread badge, the latest notifications
 * (quotes, invoices, documents, milestone progress) and a toast when one
 * arrives live. Selecting a notification marks it read and opens what it is
 * about.
 */
@Component({
  selector: 'app-portal-notifications-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [NgIcon],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideBell,
      lucideCheckCheck,
      lucideFileSignature,
      lucideFileText,
      lucideFolderOpen,
      lucidePackageCheck,
      lucidePlay,
    }),
  ],
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggle()"
        class="relative grid h-9 w-9 place-items-center rounded-md text-foreground transition-colors hover:bg-muted"
        [attr.aria-label]="unread() ? 'Notifications, ' + unread() + ' unread' : 'Notifications'"
        [attr.aria-expanded]="open()"
      >
        <ng-icon name="lucideBell" size="18" [class.animate-wiggle]="ringing()" />
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
          class="fixed inset-x-3 top-16 z-40 overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[360px]"
        >
          <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
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
          <div class="scrollbar-thin max-h-[60vh] overflow-y-auto sm:max-h-[420px]">
            @if (loading() && notifications().length === 0) {
              <p class="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</p>
            } @else if (notifications().length === 0) {
              <p class="px-4 py-8 text-center text-xs text-muted-foreground">
                You're all caught up. New quotes, invoices and project updates
                will show up here.
              </p>
            } @else {
              @for (n of notifications(); track n.id) {
                <button
                  type="button"
                  (click)="select(n)"
                  class="flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                  [class.bg-primary/5]="!n.readAt"
                >
                  <span
                    class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md"
                    [class]="n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/12 text-primary'"
                  >
                    <ng-icon [name]="icon(n)" size="14" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-2">
                      <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ n.title }}</span>
                      @if (!n.readAt) {
                        <span class="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>
                      }
                    </span>
                    <span class="mt-0.5 block text-xs leading-snug text-muted-foreground">{{ n.body }}</span>
                    <span class="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70">{{ age(n) }}</span>
                  </span>
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    @keyframes wiggle {
      0%, 100% { transform: rotate(0); }
      20% { transform: rotate(-14deg); }
      40% { transform: rotate(12deg); }
      60% { transform: rotate(-8deg); }
      80% { transform: rotate(4deg); }
    }
    .animate-wiggle { animation: wiggle 0.7s ease-in-out; }
    @media (prefers-reduced-motion: reduce) {
      .animate-wiggle { animation: none; }
    }
  `,
})
export class PortalNotificationsMenu {
  private readonly api = inject(PortalNotificationsApiService);
  private readonly realtime = inject(PortalRealtimeService);
  private readonly auth = inject(PortalAuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly unread = signal(0);
  protected readonly ringing = signal(false);
  protected readonly notifications = signal<PortalNotification[]>([]);
  private readonly base = computed(() => `/${this.auth.slug() ?? ''}`);

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.refreshCount();

    this.realtime.notifications$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((n) => {
        this.unread.update((c) => c + 1);
        this.notifications.update((list) => [n, ...list].slice(0, 30));
        this.ring();
        if (!this.open()) this.toast.info(n.title, n.body);
      });
    // Anything that arrived while the socket was down.
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        this.refreshCount();
        if (this.open()) this.refreshList();
      });
  }

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) this.refreshList();
  }

  protected close(): void {
    this.open.set(false);
  }

  /** Marks it read and opens whatever it is about. */
  protected select(n: PortalNotification): void {
    this.close();
    if (!n.readAt) {
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
    const target = this.target(n);
    if (target) void this.router.navigate(target.path, { queryParams: target.query });
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

  protected icon(n: PortalNotification): string {
    return KIND_ICON[n.kind] ?? 'lucideBell';
  }

  protected age(n: PortalNotification): string {
    const minutes = Math.floor((Date.now() - new Date(n.createdAt).getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  private target(
    n: PortalNotification,
  ): { path: string[]; query?: Record<string, string> } | null {
    const base = this.base();
    const id = n.resourceId;
    switch (n.kind) {
      case 'quote_sent':
        return { path: id ? [base, 'quotes', id] : [base, 'quotes'] };
      case 'invoice_sent':
        return { path: [base, 'invoices'], query: id ? { invoice: id } : undefined };
      case 'document_shared':
        return { path: [base, 'documents'] };
      case 'milestone_started':
      case 'milestone_delivered':
      case 'milestone_accepted':
        return id ? { path: [base, 'projects', id], query: { view: 'milestones' } } : null;
      default:
        return null;
    }
  }

  private ring(): void {
    this.ringing.set(false);
    queueMicrotask(() => this.ringing.set(true));
    setTimeout(() => this.ringing.set(false), 800);
  }

  private refreshCount(): void {
    this.api.unreadCount().subscribe({
      next: (res) => this.unread.set(res.count),
      error: () => undefined,
    });
  }

  private refreshList(): void {
    this.loading.set(true);
    this.api.list({ take: 20 }).subscribe({
      next: (res) => {
        this.notifications.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
