import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { apiErrorMessage } from '../../core/http';
import { AuthService } from '../../domains/auth';
import { ToastService } from '../../core/toast.service';
import { Field } from '../../shared/field';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NgIcon, HlmButton, HlmInput, Field],
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

        <form class="surface-card space-y-4 p-6" (ngSubmit)="submit()">
          <app-field label="Email">
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
                placeholder="mika@foundry.app"
                autocomplete="email"
              />
            </div>
          </app-field>

          <app-field label="Password">
            <div class="relative">
              <ng-icon
                name="lucideLock"
                size="16"
                class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
              />
              <input
                hlmInput
                [type]="showPassword() ? 'text' : 'password'"
                name="password"
                required
                class="w-full pl-9 pr-10"
                [(ngModel)]="password"
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
            [disabled]="submitting()"
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

  protected email = '';
  protected password = '';
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    if (!this.email.trim() || !this.password) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    this.auth
      .login({ email: this.email.trim(), password: this.password })
      .subscribe({
        next: (res) => {
          this.toast.success('Welcome back', `Signed in as ${res.user.name}.`);
          void this.router.navigateByUrl('/');
        },
        error: (err) => {
          this.submitting.set(false);
          this.error.set(apiErrorMessage(err, 'Invalid email or password.'));
        },
      });
  }
}
