import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormField, form, minLength, required } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBellRing,
  lucideBuilding2,
  lucideCheck,
  lucideMonitor,
  lucideMoon,
  lucidePalette,
  lucideSun,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { apiErrorMessage } from '../../core/http';
import { Currency } from '../../domains/shared';
import { Workspace, WorkspacesApiService } from '../../domains/workspaces';
import { ToastService } from '../../core/toast.service';
import { Accent, ThemeService } from '../../core/theme.service';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';

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
  imports: [
    FormField,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmSelectImports,
    HlmSwitchImports,
    Field,
  ],
  providers: [
    provideIcons({
      lucideBellRing,
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

  protected readonly model = signal<{
    name: string;
    currency: Currency;
    remindersEnabled: boolean;
    reminderDaysBefore: number;
  }>({
    name: '',
    currency: 'USD',
    remindersEnabled: false,
    reminderDaysBefore: 3,
  });
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'Workspace name is required' });
    minLength(p.name, 2, { message: 'Use at least 2 characters' });
  });
  protected readonly fieldError = fieldError;

  protected readonly currencyLabel = (v: string) =>
    ({
      USD: 'USD - US Dollar',
      EUR: 'EUR - Euro',
      GBP: 'GBP - British Pound',
      KES: 'KES - Kenyan Shilling',
    })[v] ?? v;

  constructor() {
    this.workspacesApi.getDefault().subscribe({
      next: (ws) => {
        this.workspace.set(ws);
        this.model.set({
          name: ws.name,
          currency: ws.currency,
          remindersEnabled: ws.remindersEnabled,
          reminderDaysBefore: ws.reminderDaysBefore,
        });
      },
      error: () => undefined,
    });
  }

  protected saveWorkspace(): void {
    const ws = this.workspace();
    if (!ws || this.f().invalid() || this.savingWorkspace()) return;
    const v = this.model();
    this.savingWorkspace.set(true);
    this.workspacesApi
      .update(ws.id, {
        name: v.name.trim(),
        currency: v.currency,
        remindersEnabled: v.remindersEnabled,
        // API accepts 1–30 days; clamp what the number input lets through.
        reminderDaysBefore: Math.min(
          30,
          Math.max(1, Math.round(v.reminderDaysBefore) || 3),
        ),
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
    {
      id: 'light' as const,
      label: 'Light',
      icon: 'lucideSun',
      disabled: false,
    },
    { id: 'dark' as const, label: 'Dark', icon: 'lucideMoon', disabled: false },
    {
      id: 'system' as const,
      label: 'System',
      icon: 'lucideMonitor',
      disabled: true,
    },
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
