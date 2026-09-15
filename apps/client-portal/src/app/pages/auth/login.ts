import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
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
import { apiErrorMessage } from '@foundry/shared-util';
import { PortalAuthService } from '../../domains/auth';
import { PortalPublicApiService } from '../../domains/portal-public';
import { Field, fieldError } from '@foundry/shared-ui';

@Component({
  selector: 'app-portal-login',
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
            <span class="font-mono text-lg font-bold">{{ initial() }}</span>
          </div>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">
            {{ brandName() }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Sign in to track projects, invoices and documents.
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
                placeholder="you@company.com"
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
              [routerLink]="['/', slug(), 'forgot-password']"
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
            Access is by invitation only. Contact your consulting team if you
            need an invite.
          </p>
        </form>
      </div>
    </div>
  `,
})
export class Login {
  private readonly auth = inject(PortalAuthService);
  private readonly portalPublicApi = inject(PortalPublicApiService);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();

  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected readonly brandName = signal('Client Portal');
  protected readonly initial = signal('F');

  protected readonly model = signal({ email: '', password: '' });
  protected readonly f = form(this.model, (p) => {
    required(p.email, { message: 'Email is required' });
    email(p.email, { message: 'Enter a valid email address' });
    required(p.password, { message: 'Password is required' });
  });
  protected readonly fieldError = fieldError;

  constructor() {
    // input.required() isn't readable until after the first change
    // detection, so the fetch has to be an effect, not a constructor call.
    effect(() => {
      this.portalPublicApi.get(this.slug()).subscribe({
        next: (portal) => {
          const name = portal.company || portal.clientName;
          this.brandName.set(name);
          this.initial.set(name.slice(0, 1).toUpperCase());
        },
        // Unknown/invalid slug - keep the generic branding rather than block
        // the form, the login call itself will fail clearly if it's really wrong.
        error: () => undefined,
      });
    });
  }

  protected submit(): void {
    if (this.f().invalid() || this.submitting()) return;
    this.error.set('');
    this.submitting.set(true);
    const { email, password } = this.model();

    this.auth.login({ email: email.trim(), password }).subscribe({
      next: (res) => void this.router.navigateByUrl(`/${res.user.portalSlug}`),
      error: (err) => {
        this.submitting.set(false);
        this.error.set(apiErrorMessage(err, 'Invalid email or password.'));
      },
    });
  }
}
