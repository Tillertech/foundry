import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideMailCheck } from '@ng-icons/lucide';
import { BrnInputOtp } from '@spartan-ng/brain/input-otp';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInputOtpImports } from '@spartan-ng/helm/input-otp';
import { apiErrorMessage } from '../../core/http';
import { ToastService } from '../../core/toast.service';
import {
  AuthApiService,
  AuthService,
  clearPendingVerification,
  getPendingVerification,
  setPendingVerification,
} from '../../domains/auth';

/**
 * Second step of signup: confirm the 6-digit code emailed to the address.
 *
 * The pending email is resolved from the ?email query param (so the emailed
 * deep link lands here directly) and mirrored to storage, so a mobile browser
 * that reloads the tab while the user is in their email app still knows which
 * address it is verifying instead of dropping them back to signup.
 */
@Component({
  selector: 'app-verify-email',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    HlmButton,
    BrnInputOtp,
    HlmInputOtpImports,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideMailCheck })],
  template: `
    <div class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10 text-foreground">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center text-center">
          <div class="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
            <ng-icon name="lucideMailCheck" size="22" />
          </div>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">
            Confirm your email
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            We sent a 6-digit code to
            <span class="font-medium text-foreground">{{ email() }}</span>
          </p>
        </div>

        <form class="surface-card flex flex-col gap-5 p-6" (submit)="$event.preventDefault(); verify()">
          <div class="flex justify-center">
            <brn-input-otp
              hlm
              maxLength="6"
              inputMode="numeric"
              autocomplete="one-time-code"
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

          @if (error()) {
            <p class="text-center text-xs text-destructive">{{ error() }}</p>
          }

          <button
            hlmBtn
            type="submit"
            class="w-full shadow-[var(--shadow-glow)]"
            [disabled]="code.length < 6 || submitting()"
          >
            {{ submitting() ? 'Verifying…' : 'Verify email' }}
          </button>

          <div class="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              class="font-medium transition-colors hover:text-primary disabled:opacity-50"
              [disabled]="resending()"
              (click)="resend()"
            >
              {{ resending() ? 'Sending…' : 'Resend code' }}
            </button>
            <a
              routerLink="/auth/signup"
              (click)="reset()"
              class="flex items-center gap-1.5 font-medium transition-colors hover:text-primary"
            >
              <ng-icon name="lucideArrowLeft" size="14" />
              Use a different email
            </a>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class VerifyEmail implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(AuthApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected code = '';
  protected readonly email = signal('');
  protected readonly submitting = signal(false);
  protected readonly resending = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    const fromQuery = this.route.snapshot.queryParamMap.get('email');
    const pending = fromQuery ?? getPendingVerification();
    if (!pending) {
      // Nothing to verify - start over.
      void this.router.navigateByUrl('/auth/signup');
      return;
    }
    setPendingVerification(pending);
    this.email.set(pending);
  }

  protected verify(): void {
    if (this.code.length < 6 || this.submitting()) return;
    this.error.set('');
    this.submitting.set(true);
    this.auth.verifyEmail({ email: this.email(), otp: this.code }).subscribe({
      next: (res) => {
        clearPendingVerification();
        this.toast.success('Email confirmed', `Welcome, ${res.user.name}.`);
        void this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.submitting.set(false);
        this.code = '';
        this.error.set(
          apiErrorMessage(err, 'That code is not valid. Try again.'),
        );
      },
    });
  }

  protected resend(): void {
    if (this.resending()) return;
    this.resending.set(true);
    this.error.set('');
    this.api.resendVerification({ email: this.email() }).subscribe({
      next: (res) => {
        this.resending.set(false);
        this.toast.info('Code sent', res.message);
      },
      error: (err) => {
        this.resending.set(false);
        this.error.set(apiErrorMessage(err, 'Could not resend the code.'));
      },
    });
  }

  protected reset(): void {
    clearPendingVerification();
  }
}
