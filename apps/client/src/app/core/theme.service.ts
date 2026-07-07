import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

const MODE_KEY = 'ledger-theme';
const ACCENT_KEY = 'ledger-accent';

export type Accent = 'orange' | 'blue' | 'emerald' | 'purple' | 'slate';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  /** Dark is the default flagship look. */
  readonly dark = signal(true);
  readonly accent = signal<Accent>('orange');

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const mode = localStorage.getItem(MODE_KEY);
      if (mode) this.dark.set(mode === 'dark');
      const accent = localStorage.getItem(ACCENT_KEY) as Accent | null;
      if (accent) this.accent.set(accent);
    }

    effect(() => {
      const dark = this.dark();
      this.document.documentElement.classList.toggle('dark', dark);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MODE_KEY, dark ? 'dark' : 'light');
      }
    });

    effect(() => {
      const accent = this.accent();
      this.document.documentElement.setAttribute('data-accent', accent);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ACCENT_KEY, accent);
      }
    });
  }

  toggle(): void {
    this.dark.update((v) => !v);
  }

  setMode(mode: 'light' | 'dark'): void {
    this.dark.set(mode === 'dark');
  }

  setAccent(accent: Accent): void {
    this.accent.set(accent);
  }
}
