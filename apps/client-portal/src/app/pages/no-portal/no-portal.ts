import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-no-portal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <div class="w-full max-w-sm text-center">
        <div
          class="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
        >
          <span class="font-mono text-lg font-bold">F</span>
        </div>
        <h1 class="mt-4 text-2xl font-semibold tracking-tight">
          Client Portal
        </h1>
        <p class="mt-3 text-sm text-muted-foreground">
          This link doesn't point at a specific portal. Open the invite or
          sign-in link your consulting team sent you to continue.
        </p>
      </div>
    </div>
  `,
})
export class NoPortal {}
