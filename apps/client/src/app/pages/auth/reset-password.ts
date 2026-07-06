import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideMail, lucideMailCheck } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { Field } from '../../shared/field';

@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NgIcon, HlmButton, HlmInput, Field],
  providers: [provideIcons({ lucideArrowLeft, lucideMail, lucideMailCheck })],
  template: `
    <div class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10 text-foreground">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center text-center">
          <div
            class="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            <span class="font-mono text-lg font-bold">L</span>
          </div>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            We'll email you a link to set a new one.
          </p>
        </div>

        @if (sent()) {
          <div class="surface-card flex flex-col items-center p-8 text-center">
            <div class="grid h-12 w-12 place-items-center rounded-xl bg-success/12 text-success">
              <ng-icon name="lucideMailCheck" size="22" />
            </div>
            <p class="mt-4 text-sm font-semibold">Check your inbox</p>
            <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
              If an account exists for
              <span class="font-medium text-foreground">{{ email }}</span
              >, a reset link is on its way. It expires in 30 minutes.
            </p>
            <p class="mt-3 text-[11px] text-muted-foreground">
              Demo workspace — no email is actually sent.
            </p>
            <a hlmBtn variant="ghost" size="sm" routerLink="/auth/login" class="mt-5 gap-1.5">
              <ng-icon name="lucideArrowLeft" size="14" />
              Back to sign in
            </a>
          </div>
        } @else {
          <form class="surface-card space-y-4 p-6" (ngSubmit)="submit()">
            <app-field label="Email" hint="Use the address you signed up with.">
              <div class="relative">
                <ng-icon
                  name="lucideMail"
                  size="16"
                  class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  hlmInput
                  type="email"
                  name="email"
                  required
                  class="w-full pl-9"
                  [(ngModel)]="email"
                  placeholder="mika@ledger.app"
                  autocomplete="email"
                />
              </div>
            </app-field>

            @if (error()) {
              <p class="text-xs text-destructive">{{ error() }}</p>
            }

            <button hlmBtn type="submit" class="w-full shadow-[var(--shadow-glow)]">
              Send reset link
            </button>

            <a
              routerLink="/auth/login"
              class="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <ng-icon name="lucideArrowLeft" size="14" />
              Back to sign in
            </a>
          </form>
        }
      </div>
    </div>
  `,
})
export class ResetPassword {
  protected email = '';
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    if (!this.email.trim() || !this.email.includes('@')) {
      this.error.set('Enter a valid email address.');
      return;
    }
    this.error.set('');
    this.sent.set(true);
  }
}
