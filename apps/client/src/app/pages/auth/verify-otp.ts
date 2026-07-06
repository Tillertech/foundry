import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideShieldCheck } from '@ng-icons/lucide';
import { BrnInputOtp } from '@spartan-ng/brain/input-otp';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInputOtpImports } from '@spartan-ng/helm/input-otp';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-verify-otp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NgIcon, HlmButton, BrnInputOtp, HlmInputOtpImports],
  providers: [provideIcons({ lucideArrowLeft, lucideShieldCheck })],
  template: `
    <div class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10 text-foreground">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center text-center">
          <div
            class="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            <ng-icon name="lucideShieldCheck" size="22" />
          </div>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">Check your email</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            We sent a 6-digit code to
            <span class="font-medium text-foreground">{{ auth.pendingEmail() }}</span>
          </p>
        </div>

        <form class="surface-card flex flex-col items-center gap-5 p-6" (ngSubmit)="submit()">
          <brn-input-otp
            hlm
            maxLength="6"
            inputMode="numeric"
            [(ngModel)]="code"
            name="otp"
            (completed)="submit()"
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

          @if (error()) {
            <p class="text-xs text-destructive">{{ error() }}</p>
          }

          <button
            hlmBtn
            type="submit"
            class="w-full shadow-[var(--shadow-glow)]"
            [disabled]="code.length < 6"
          >
            Verify and sign in
          </button>

          <div class="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <button type="button" class="font-medium transition-colors hover:text-primary" (click)="resend()">
              Resend code
            </button>
            <a
              routerLink="/auth/login"
              class="flex items-center gap-1.5 font-medium transition-colors hover:text-primary"
            >
              <ng-icon name="lucideArrowLeft" size="14" />
              Use a different account
            </a>
          </div>

          <p class="text-center text-[11px] text-muted-foreground">
            Demo workspace — any 6-digit code works.
          </p>
        </form>
      </div>
    </div>
  `,
})
export class VerifyOtp {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected code = '';
  protected readonly error = signal('');

  protected submit(): void {
    if (this.code.length < 6) return;
    if (this.auth.verifyOtp(this.code)) {
      this.toast.success('Welcome back', 'You are signed in.');
      void this.router.navigateByUrl('/');
    } else {
      this.error.set('That code is not valid. Try again.');
    }
  }

  protected resend(): void {
    this.toast.info('Code resent', 'Check your inbox for a fresh 6-digit code.');
  }
}
