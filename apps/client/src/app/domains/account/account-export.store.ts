import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AccountApiService, bundleFileName, type AccountExport } from './account-api.service';

const LAST_EXPORT_KEY = 'foundry.account-export';
const POLL_MS = 3000;

const remember = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LAST_EXPORT_KEY, id);
    else localStorage.removeItem(LAST_EXPORT_KEY);
  } catch {
    // Private mode: the export still works, it just is not remembered.
  }
};
const recall = (): string | null => {
  try {
    return localStorage.getItem(LAST_EXPORT_KEY);
  } catch {
    return null;
  }
};

/**
 * The account export as the settings page shows it. Exports run in the
 * background on the API; this polls while one is queued or running, and the
 * owner also gets a notification and an email when it ends. Provide it on
 * the component, so polling stops when the page closes.
 */
@Injectable()
export class AccountExportStore {
  private readonly api = inject(AccountApiService);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly current = signal<AccountExport | null>(null);
  readonly busy = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    const id = recall();
    if (id) void this.refresh(id);
  }

  async request(): Promise<void> {
    this.busy.set(true);
    try {
      const status = await firstValueFrom(this.api.requestExport());
      remember(status.id);
      this.apply(status);
    } finally {
      this.busy.set(false);
    }
  }

  /** Saves the finished bundle in the browser. */
  async download(): Promise<void> {
    const id = this.current()?.id;
    if (!id) return;
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.download(id));
      if (!res.body) return;
      const url = URL.createObjectURL(res.body);
      const link = document.createElement('a');
      link.href = url;
      link.download = bundleFileName(res);
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      this.busy.set(false);
    }
  }

  private async refresh(id: string): Promise<void> {
    try {
      this.apply(await firstValueFrom(this.api.exportStatus(id)));
    } catch {
      // Gone (expired and cleaned up, or another account's): forget it.
      remember(null);
      this.current.set(null);
      this.stop();
    }
  }

  private apply(status: AccountExport): void {
    this.current.set(status);
    this.stop();
    if (status.state === 'queued' || status.state === 'running') {
      this.timer = setTimeout(() => void this.refresh(status.id), POLL_MS);
    }
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
