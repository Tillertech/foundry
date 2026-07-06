import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideMonitor,
  lucideMoon,
  lucidePalette,
  lucideRotateCcw,
  lucideSun,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { StoreService } from '../../core/store.service';
import { Accent, ThemeService } from '../../core/theme.service';

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
  imports: [NgIcon, HlmButton],
  providers: [
    provideIcons({
      lucideCheck,
      lucideMonitor,
      lucideMoon,
      lucidePalette,
      lucideRotateCcw,
      lucideSun,
    }),
  ],
  templateUrl: './settings.html',
})
export class Settings {
  protected readonly theme = inject(ThemeService);
  protected readonly store = inject(StoreService);

  protected readonly accents = accents;

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
