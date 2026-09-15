import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormField, form, minLength, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '@foundry/shared-util';
import { PortalAuthService } from '../../domains/auth';
import { PortalPublicApiService } from '../../domains/portal-public';
import { Field, fieldError } from '@foundry/shared-ui';

@Component({
  selector: 'app-portal-accept-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, NgIcon, HlmButton, HlmInput, Field],
  providers: [provideIcons({ lucideLock })],
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
            Welcome to {{ brandName() }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            @if (email()) {
              Set a password for
              <span class="font-medium text-foreground">{{ email() }}</span>
            } @else {
              Set a password to activate your account.
            }
          </p>
        </div>

        @if (!token() || !email()) {
          <div class="surface-card space-y-3 p-6 text-center">
            <p class="text-sm font-semibold">This invite link is invalid</p>
            <p class="text-xs text-muted-foreground">
              The link is missing or incomplete. Ask your consulting team to
              resend your invite.
            </p>
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

            <app-field label="Confirm password" [error]="confirmError()">
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
                  [value]="confirmPassword()"
                  (input)="confirmPassword.set($any($event.target).value)"
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
              [disabled]="submitting() || f().invalid() || !passwordsMatch()"
            >
              {{ submitting() ? 'Setting up…' : 'Set password & continue' }}
            </button>
          </form>
        }
      </div>
    </div>
  `,
})
export class AcceptInvite {
  readonly slug = input.required<string>();
  readonly token = input<string>();
  readonly email = input<string>();

  private readonly auth = inject(PortalAuthService);
  private readonly portalPublicApi = inject(PortalPublicApiService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly confirmPassword = signal('');

  protected readonly brandName = signal('your client portal');
  protected readonly initial = signal('F');

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
        error: () => undefined,
      });
    });
  }

  protected readonly model = signal({ password: '' });
  protected readonly f = form(this.model, (p) => {
    required(p.password, { message: 'Password is required' });
    minLength(p.password, 8, { message: 'Use at least 8 characters' });
  });
  protected readonly fieldError = fieldError;

  protected readonly passwordsMatch = () =>
    this.confirmPassword().length > 0 &&
    this.confirmPassword() === this.model().password;

  protected readonly confirmError = () =>
    this.confirmPassword() && !this.passwordsMatch()
      ? 'Passwords do not match'
      : '';

  protected submit(): void {
    const token = this.token();
    const email = this.email();
    if (!token || !email) return;
    if (this.f().invalid() || this.submitting() || !this.passwordsMatch())
      return;

    this.error.set('');
    this.submitting.set(true);
    this.auth
      .acceptInvite({ email, token, password: this.model().password })
      .subscribe({
        next: (res) =>
          void this.router.navigateByUrl(`/${res.user.portalSlug}`),
        error: (err) => {
          this.submitting.set(false);
          this.error.set(
            apiErrorMessage(err, 'This invite link is invalid or has expired.'),
          );
        },
      });
  }
}
