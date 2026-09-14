import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormField, email, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideMail, lucideMailCheck } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '@foundry/shared-util';
import { PortalAuthApiService } from '../../domains/auth';
import { Field, fieldError } from '@foundry/shared-ui';

@Component({
  selector: 'app-portal-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, RouterLink, NgIcon, HlmButton, HlmInput, Field],
  providers: [provideIcons({ lucideArrowLeft, lucideMail, lucideMailCheck })],
  template: `
    <div
      class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center text-center">
          <div
            class="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            @if (sent()) {
              <ng-icon name="lucideMailCheck" size="22" />
            } @else {
              <span class="font-mono text-lg font-bold">F</span>
            }
          </div>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">
            {{ sent() ? 'Check your email' : 'Reset your password' }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            @if (sent()) {
              If that email has portal access, we've sent a link to reset your
              password.
            } @else {
              We'll email you a link to set a new one.
            }
          </p>
        </div>

        @if (!sent()) {
          <form
            class="surface-card space-y-4 p-6"
            (submit)="$event.preventDefault(); submit()"
          >
            <app-field label="Email" [error]="fieldError(f.email())">
              <div class="relative">
                <ng-icon
                  name="lucideMail"
                  size="16"
                  class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  hlmInput
                  type="email"
                  class="w-full pl-9"
                  [formField]="f.email"
                  placeholder="you@company.com"
                  autocomplete="email"
                />
              </div>
            </app-field>

            @if (error()) {
              <p class="text-xs text-destructive">{{ error() }}</p>
            }

            <button
              hlmBtn
              type="submit"
              class="w-full shadow-[var(--shadow-glow)]"
              [disabled]="submitting() || f().invalid()"
            >
              {{ submitting() ? 'Sending…' : 'Send reset link' }}
            </button>

            <a
              routerLink="/login"
              class="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <ng-icon name="lucideArrowLeft" size="14" />
              Back to sign in
            </a>
          </form>
        } @else {
          <a
            routerLink="/login"
            hlmBtn
            variant="outline"
            class="w-full gap-1.5"
          >
            <ng-icon name="lucideArrowLeft" size="14" />
            Back to sign in
          </a>
        }
      </div>
    </div>
  `,
})
export class ForgotPassword {
  private readonly api = inject(PortalAuthApiService);

  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly sent = signal(false);

  protected readonly model = signal({ email: '' });
  protected readonly f = form(this.model, (p) => {
    required(p.email, { message: 'Email is required' });
    email(p.email, { message: 'Enter a valid email address' });
  });
  protected readonly fieldError = fieldError;

  protected submit(): void {
    if (this.f().invalid() || this.submitting()) return;
    this.error.set('');
    this.submitting.set(true);
    this.api.forgotPassword({ email: this.model().email.trim() }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sent.set(true);
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(apiErrorMessage(err, 'Could not send the reset link.'));
      },
    });
  }
}
