import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormField,
  email,
  form,
  minLength,
  required,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideEye,
  lucideEyeOff,
  lucideLock,
  lucideMail,
  lucideUser,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '../../core/http';
import { AuthService, setPendingVerification } from '../../domains/auth';
import { ToastService } from '../../core/toast.service';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';

@Component({
  selector: 'app-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, RouterLink, NgIcon, HlmButton, HlmInput, Field],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideEye,
      lucideEyeOff,
      lucideLock,
      lucideMail,
      lucideUser,
    }),
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
            Create your account
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            A default workspace is set up for you.
          </p>
        </div>

        <form class="surface-card space-y-4 p-6" (submit)="$event.preventDefault(); submit()">
          <app-field label="Full name" [error]="fieldError(f.name())">
            <div class="relative">
              <ng-icon
                name="lucideUser"
                size="16"
                class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
              />
              <input
                hlmInput
                type="text"
                class="w-full pl-9"
                [formField]="f.name"
                placeholder="Mika Sato"
                autocomplete="name"
              />
            </div>
          </app-field>

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

          <app-field label="Password" hint="At least 8 characters." [error]="fieldError(f.password())">
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
                autocomplete="new-password"
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

          <app-field label="Workspace name" hint="Optional - defaults to your studio.">
            <div class="relative">
              <ng-icon
                name="lucideBuilding2"
                size="16"
                class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
              />
              <input
                hlmInput
                type="text"
                class="w-full pl-9"
                [formField]="f.workspaceName"
                placeholder="Studio workspace"
                autocomplete="organization"
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
            {{ submitting() ? 'Creating account…' : 'Create account' }}
          </button>

          <p class="text-center text-xs text-muted-foreground">
            Already have an account?
            <a
              routerLink="/auth/login"
              class="font-medium text-primary transition-colors hover:underline"
            >
              Sign in
            </a>
          </p>
        </form>
      </div>
    </div>
  `,
})
export class Signup {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected readonly model = signal({
    name: '',
    email: '',
    password: '',
    workspaceName: '',
  });
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'Name is required' });
    minLength(p.name, 2, { message: 'Use at least 2 characters' });
    required(p.email, { message: 'Email is required' });
    email(p.email, { message: 'Enter a valid email address' });
    required(p.password, { message: 'Password is required' });
    minLength(p.password, 8, { message: 'Use at least 8 characters' });
  });
  protected readonly fieldError = fieldError;

  protected submit(): void {
    if (this.f().invalid() || this.submitting()) return;
    const v = this.model();
    this.error.set('');
    this.submitting.set(true);
    this.auth
      .signup({
        name: v.name.trim(),
        email: v.email.trim(),
        password: v.password,
        workspaceName: v.workspaceName.trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          setPendingVerification(res.email);
          this.toast.info('Check your email', res.message);
          void this.router.navigate(['/auth/verify'], {
            queryParams: { email: res.email },
          });
        },
        error: (err) => {
          this.submitting.set(false);
          this.error.set(apiErrorMessage(err, 'Could not create the account.'));
        },
      });
  }
}
