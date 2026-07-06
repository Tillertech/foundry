import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideCheck,
  lucideMonitor,
  lucideMoon,
  lucidePalette,
  lucideSun,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { apiErrorMessage } from '../../core/http';
import { Currency } from '../../domains/shared';
import { Workspace, WorkspacesApiService } from '../../domains/workspaces';
import { ToastService } from '../../core/toast.service';
import { Accent, ThemeService } from '../../core/theme.service';
import { Field } from '../../shared/field';

const accents: { id: Accent; label: string; swatch: string }[] = [
  { id: 'orange', label: 'Orange', swatch: '#f97316' },
  { id: 'blue', label: 'Blue', swatch: '#3b82f6' },
  { id: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { id: 'purple', label: 'Purple', swatch: '#8b5cf6' },
  { id: 'slate', label: 'Slate', swatch: '#64748b' },
];

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgIcon, HlmButton, HlmInput, HlmNativeSelectImports, Field],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideCheck,
      lucideMonitor,
      lucideMoon,
      lucidePalette,
      lucideSun,
    }),
  ],
  templateUrl: './settings.html',
})
export class Settings {
  protected readonly theme = inject(ThemeService);
  private readonly workspacesApi = inject(WorkspacesApiService);
  private readonly toast = inject(ToastService);

  protected readonly accents = accents;

  protected readonly workspace = signal<Workspace | null>(null);
  protected readonly savingWorkspace = signal(false);
  protected workspaceName = '';
  protected workspaceCurrency: Currency = 'USD';

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.workspacesApi.getDefault().subscribe({
        next: (ws) => {
          this.workspace.set(ws);
          this.workspaceName = ws.name;
          this.workspaceCurrency = ws.currency;
        },
        error: () => undefined,
      });
    }
  }

  protected saveWorkspace(): void {
    const ws = this.workspace();
    if (!ws || !this.workspaceName.trim() || this.savingWorkspace()) return;
    this.savingWorkspace.set(true);
    this.workspacesApi
      .update(ws.id, {
        name: this.workspaceName.trim(),
        currency: this.workspaceCurrency,
      })
      .subscribe({
        next: (updated) => {
          this.savingWorkspace.set(false);
          this.workspace.set(updated);
          this.toast.updated('Workspace');
        },
        error: (err) => {
          this.savingWorkspace.set(false);
          this.toast.error('Could not update workspace', apiErrorMessage(err));
        },
      });
  }

  protected readonly modes = [
    { id: 'light' as const, label: 'Light', icon: 'lucideSun', disabled: false },
    { id: 'dark' as const, label: 'Dark', icon: 'lucideMoon', disabled: false },
    { id: 'system' as const, label: 'System', icon: 'lucideMonitor', disabled: true },
  ];

  protected isActiveMode(id: 'light' | 'dark' | 'system'): boolean {
    if (id === 'system') return false;
    return this.theme.dark() === (id === 'dark');
  }

  protected setMode(id: 'light' | 'dark' | 'system'): void {
    if (id === 'system') return;
    this.theme.setMode(id);
  }
}
