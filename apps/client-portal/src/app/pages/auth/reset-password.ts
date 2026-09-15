import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormField, form, minLength, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideLock } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '@foundry/shared-util';
import { PortalAuthApiService } from '../../domains/auth';
import { Field, fieldError } from '@foundry/shared-ui';

@Component({
  selector: 'app-portal-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, RouterLink, NgIcon, HlmButton, HlmInput, Field],
  providers: [provideIcons({ lucideCheck, lucideLock })],
  template: `
    <div
      class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center text-center">
          <div
            class="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            @if (done()) {
              <ng-icon name="lucideCheck" size="22" />
            } @else {
              <span class="font-mono text-lg font-bold">F</span>
            }
          </div>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">
            {{ done() ? 'Password updated' : 'Choose a new password' }}
          </h1>
          @if (!done()) {
            <p class="mt-1 text-sm text-muted-foreground">
              @if (email()) {
                For
                <span class="font-medium text-foreground">{{ email() }}</span>
              } @else {
                Set a new password for your account.
              }
            </p>
          }
        </div>

        @if (!token() || !email()) {
          <div class="surface-card space-y-3 p-6 text-center">
            <p class="text-sm font-semibold">This reset link is invalid</p>
            <p class="text-xs text-muted-foreground">
              The link is missing or incomplete. Request a new one from the
              sign-in page.
            </p>
            <a
              [routerLink]="['/', slug(), 'forgot-password']"
              hlmBtn
              variant="outline"
              size="sm"
            >
              Request a new link
            </a>
          </div>
        } @else if (done()) {
          <div class="surface-card space-y-4 p-6 text-center">
            <p class="text-sm text-muted-foreground">
              Sign in with your new password.
            </p>
            <a
              [routerLink]="['/', slug(), 'login']"
              hlmBtn
              class="w-full shadow-[var(--shadow-glow)]"
            >
              Go to sign in
            </a>
          </div>
        } @else {
          <form
            class="surface-card space-y-4 p-6"
            (submit)="$event.preventDefault(); submit()"
          >
            <app-field
              label="New password"
              hint="At least 8 characters."
              [error]="fieldError(f.password())"
            >
              <div class="relative">
                <ng-icon
                  name="lucideLock"
                  size="16"
                  class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  hlmInput
                  type="password"
                  class="w-full pl-9"
                  [formField]="f.password"
                  placeholder="••••••••"
                  autocomplete="new-password"
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
              {{ submitting() ? 'Updating…' : 'Update password' }}
            </button>
          </form>
        }
      </div>
    </div>
  `,
})
export class ResetPassword {
  readonly slug = input.required<string>();
  readonly token = input<string>();
  readonly email = input<string>();

  private readonly api = inject(PortalAuthApiService);

  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal(false);

  protected readonly model = signal({ password: '' });
  protected readonly f = form(this.model, (p) => {
    required(p.password, { message: 'Password is required' });
    minLength(p.password, 8, { message: 'Use at least 8 characters' });
  });
  protected readonly fieldError = fieldError;

  protected submit(): void {
    const token = this.token();
    const email = this.email();
    if (!token || !email) return;
    if (this.f().invalid() || this.submitting()) return;

    this.error.set('');
    this.submitting.set(true);
    this.api
      .resetPassword({ email, token, password: this.model().password })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.done.set(true);
        },
        error: (err) => {
          this.submitting.set(false);
          this.error.set(
            apiErrorMessage(err, 'This reset link is invalid or has expired.'),
          );
        },
      });
  }
}
