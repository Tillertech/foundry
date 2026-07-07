import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FormField,
  email as emailValidator,
  form,
  minLength,
  required,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideLock, lucideMail, lucideShieldCheck } from '@ng-icons/lucide';
import { BrnInputOtp } from '@spartan-ng/brain/input-otp';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmInputOtpImports } from '@spartan-ng/helm/input-otp';
import { apiErrorMessage } from '../../core/http';
import { AuthApiService } from '../../domains/auth';
import { ToastService } from '../../core/toast.service';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';

/**
 * Two-step reset: request a 6-digit code by email, then exchange the
 * code plus a new password via POST /auth/reset-password.
 */
@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    FormField,
    RouterLink,
    NgIcon,
    HlmButton,
    HlmInput,
    Field,
    BrnInputOtp,
    HlmInputOtpImports,
  ],
  providers: [
    provideIcons({ lucideArrowLeft, lucideLock, lucideMail, lucideShieldCheck }),
  ],
  template: `
    <div class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10 text-foreground">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center text-center">
          <div
            class="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            @if (step() === 'email') {
              <span class="font-mono text-lg font-bold">F</span>
            } @else {
              <ng-icon name="lucideShieldCheck" size="22" />
            }
          </div>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">
            {{ step() === 'email' ? 'Reset your password' : 'Check your email' }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            @if (step() === 'email') {
              We'll email you a 6-digit code to set a new one.
            } @else {
              We sent a 6-digit code to
              <span class="font-medium text-foreground">{{ model().email }}</span>
            }
          </p>
        </div>

        @if (step() === 'email') {
          <form class="surface-card space-y-4 p-6" (submit)="$event.preventDefault(); sendCode()">
            <app-field
              label="Email"
              hint="Use the address you signed up with."
              [error]="fieldError(f.email())"
            >
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

            @if (error()) {
              <p class="text-xs text-destructive">{{ error() }}</p>
            }

            <button
              hlmBtn
              type="submit"
              class="w-full shadow-[var(--shadow-glow)]"
              [disabled]="submitting() || f.email().invalid()"
            >
              {{ submitting() ? 'Sending…' : 'Send reset code' }}
            </button>

            <a
              routerLink="/auth/login"
              class="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <ng-icon name="lucideArrowLeft" size="14" />
              Back to sign in
            </a>
          </form>
        } @else {
          <form class="surface-card flex flex-col gap-5 p-6" (submit)="$event.preventDefault(); reset()">
            <div class="flex justify-center">
              <brn-input-otp
                hlm
                maxLength="6"
                inputMode="numeric"
                [(ngModel)]="code"
                name="otp"
              >
                <hlm-input-otp-group>
                  <hlm-input-otp-slot index="0" />
                  <hlm-input-otp-slot index="1" />
                  <hlm-input-otp-slot index="2" />
                </hlm-input-otp-group>
                <hlm-input-otp-separator />
                <hlm-input-otp-group>
                  <hlm-input-otp-slot index="3" />
                  <hlm-input-otp-slot index="4" />
                  <hlm-input-otp-slot index="5" />
                </hlm-input-otp-group>
              </brn-input-otp>
            </div>

            <app-field
              label="New password"
              hint="At least 8 characters."
              [error]="fieldError(f.newPassword())"
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
                  [formField]="f.newPassword"
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
              [disabled]="code.length < 6 || f.newPassword().invalid() || submitting()"
            >
              {{ submitting() ? 'Resetting…' : 'Reset password' }}
            </button>

            <div class="flex flex-col items-center gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                class="font-medium transition-colors hover:text-primary"
                (click)="sendCode()"
              >
                Resend code
              </button>
              <button
                type="button"
                class="flex items-center gap-1.5 font-medium transition-colors hover:text-primary"
                (click)="step.set('email')"
              >
                <ng-icon name="lucideArrowLeft" size="14" />
                Use a different email
              </button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class ResetPassword {
  private readonly api = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected code = '';
  protected readonly step = signal<'email' | 'reset'>('email');
  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected readonly model = signal({ email: '', newPassword: '' });
  protected readonly f = form(this.model, (p) => {
    required(p.email, { message: 'Email is required' });
    emailValidator(p.email, { message: 'Enter a valid email address' });
    required(p.newPassword, { message: 'Password is required' });
    minLength(p.newPassword, 8, { message: 'Use at least 8 characters' });
  });
  protected readonly fieldError = fieldError;

  protected sendCode(): void {
    if (this.f.email().invalid()) return;
    this.error.set('');
    this.submitting.set(true);
    this.api.forgotPassword({ email: this.model().email.trim() }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.step.set('reset');
        this.toast.info('Code sent', res.message);
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(apiErrorMessage(err, 'Could not send the reset code.'));
      },
    });
  }

  protected reset(): void {
    if (this.code.length < 6 || this.f.newPassword().invalid()) return;
    const v = this.model();
    this.error.set('');
    this.submitting.set(true);
    this.api
      .resetPassword({
        email: v.email.trim(),
        otp: this.code,
        newPassword: v.newPassword,
      })
      .subscribe({
        next: () => {
          this.toast.success('Password reset', 'Sign in with your new password.');
          void this.router.navigateByUrl('/auth/login');
        },
        error: (err) => {
          this.submitting.set(false);
          this.error.set(apiErrorMessage(err, 'That code is not valid. Try again.'));
        },
      });
  }
}
