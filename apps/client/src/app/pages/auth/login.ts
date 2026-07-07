import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormField, email, form, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideEye,
  lucideEyeOff,
  lucideLock,
  lucideMail,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from '../../core/http';
import {
  AuthService,
  setPendingLogin,
  setPendingVerification,
} from '../../domains/auth';
import { ToastService } from '../../core/toast.service';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, RouterLink, NgIcon, HlmButton, HlmInput, Field],
  providers: [
    provideIcons({ lucideEye, lucideEyeOff, lucideLock, lucideMail }),
  ],
  template: `
    <div
      class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center text-center">
          <div
            class="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            <span class="font-mono text-lg font-bold">F</span>
          </div>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Sign in to your Foundry workspace
          </p>
        </div>

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
                placeholder="mika@foundry.app"
                autocomplete="email"
              />
            </div>
          </app-field>

          <app-field label="Password" [error]="fieldError(f.password())">
            <div class="relative">
              <ng-icon
                name="lucideLock"
                size="16"
                class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
              />
              <input
                hlmInput
                [type]="showPassword() ? 'text' : 'password'"
                class="w-full pl-9 pr-10"
                [formField]="f.password"
                placeholder="••••••••"
                autocomplete="current-password"
              />
              <button
                type="button"
                (click)="showPassword.set(!showPassword())"
                class="absolute right-2 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                [attr.aria-label]="
                  showPassword() ? 'Hide password' : 'Show password'
                "
              >
                <ng-icon
                  [name]="showPassword() ? 'lucideEyeOff' : 'lucideEye'"
                  size="15"
                />
              </button>
            </div>
          </app-field>

          <div class="flex items-center justify-end">
            <a
              routerLink="/auth/reset"
              class="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              Forgot password?
            </a>
          </div>

          @if (error()) {
            <p class="text-xs text-destructive">{{ error() }}</p>
          }

          <button
            hlmBtn
            type="submit"
            class="w-full shadow-[var(--shadow-glow)]"
            [disabled]="submitting() || f().invalid()"
          >
            {{ submitting() ? 'Signing in…' : 'Sign in' }}
          </button>

          <p class="text-center text-xs text-muted-foreground">
            No account yet?
            <a
              routerLink="/auth/signup"
              class="font-medium text-primary transition-colors hover:underline"
            >
              Create one
            </a>
          </p>
        </form>
      </div>
    </div>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected readonly model = signal({ email: '', password: '' });
  protected readonly f = form(this.model, (p) => {
    required(p.email, { message: 'Email is required' });
    email(p.email, { message: 'Enter a valid email address' });
    required(p.password, { message: 'Password is required' });
  });
  protected readonly fieldError = fieldError;

  protected submit(): void {
    if (this.f().invalid() || this.submitting()) return;
    const v = this.model();
    this.error.set('');
    this.submitting.set(true);
    const email = this.model().email.trim();
    this.auth.login({ email, password: v.password }).subscribe({
      next: (res) => {
        // Credentials ok — a sign-in code was emailed. Persist the email so the
        // code screen survives a reload, then hand off to it.
        setPendingLogin(res.email);
        this.toast.info('Check your email', res.message);
        void this.router.navigate(['/auth/verify-login'], {
          queryParams: { email: res.email },
        });
      },
      error: (err) => {
        this.submitting.set(false);
        // Valid credentials on an unconfirmed account: the API re-sends a
        // verification code and returns 403 - send them to confirm the email.
        if (err instanceof HttpErrorResponse && err.status === 403) {
          setPendingVerification(email);
          this.toast.info('Confirm your email', 'We sent you a new code.');
          void this.router.navigate(['/auth/verify'], {
            queryParams: { email },
          });
          return;
        }
        this.error.set(apiErrorMessage(err, 'Invalid email or password.'));
      },
    });
  }
}
