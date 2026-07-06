import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmToaster } from '@spartan-ng/helm/sonner';
import { ThemeService } from './core/theme.service';

@Component({
  imports: [RouterOutlet, HlmToaster],
  selector: 'app-root',
  template: `
    <router-outlet />
    <hlm-toaster richColors [theme]="theme.dark() ? 'dark' : 'light'" position="bottom-right" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = inject(ThemeService);
}
