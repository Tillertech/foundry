import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormField, email, form, minLength, required } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBell,
  lucideBellRing,
  lucideBuilding2,
  lucideCheck,
  lucideFileText,
  lucideImage,
  lucideMapPin,
  lucideMonitor,
  lucideMoon,
  lucidePalette,
  lucideReceipt,
  lucideShieldAlert,
  lucideSun,
  lucideTrash2,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/http';
import { Currency } from '../../domains/shared';
import {
  UpdateWorkspaceRequest,
  Workspace,
  WorkspacesApiService,
} from '../../domains/workspaces';
import { ToastService } from '../../core/toast.service';
import { Accent, ThemeService } from '../../core/theme.service';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';

const LOGO_TYPES = ['image/png', 'image/jpeg'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

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
    HlmTextarea,
    HlmSelectImports,
    HlmSwitchImports,
    HlmTabsImports,
    Field,
  ],
  providers: [
    provideIcons({
      lucideBell,
      lucideBellRing,
      lucideBuilding2,
      lucideCheck,
      lucideFileText,
      lucideImage,
      lucideMapPin,
      lucideMonitor,
      lucideMoon,
      lucidePalette,
      lucideReceipt,
      lucideShieldAlert,
      lucideSun,
      lucideTrash2,
      lucideUpload,
    }),
  ],
  templateUrl: './settings.html',
})
export class Settings {
  protected readonly theme = inject(ThemeService);
  private readonly workspacesApi = inject(WorkspacesApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly workspace = signal<Workspace | null>(null);
  protected readonly savingWorkspace = signal(false);

  protected readonly logoUrl = signal<string | null>(null);
  protected readonly logoBusy = signal(false);

  protected readonly comingSoon = [
    {
      id: 'templates',
      icon: 'lucideFileText',
      title: 'Template designer',
      description:
        'Configure branded layouts and copy for invoices, quotes, receipts and emails.',
    },
    {
      id: 'notifications',
      icon: 'lucideBell',
      title: 'Notification preferences',
      description:
        'Choose which emails and in-app alerts you receive - payments, overdue invoices, weekly summaries.',
    },
  ];

  protected readonly accents = accents;

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

  protected readonly model = signal<{
    name: string;
    legalName: string;
    email: string;
    phone: string;
    website: string;
    address: string;
    city: string;
    postCode: string;
    country: string;
    taxCode: string;
    currency: Currency;
    taxRate: number;
    paymentTerms: number;
    invoicePrefix: string;
    quotePrefix: string;
    footerNote: string;
    remindersEnabled: boolean;
    reminderDaysBefore: number;
  }>({
    name: '',
    legalName: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    postCode: '',
    country: '',
    taxCode: '',
    currency: 'USD',
    taxRate: 0,
    paymentTerms: 7,
    invoicePrefix: '',
    quotePrefix: '',
    footerNote: '',
    remindersEnabled: false,
    reminderDaysBefore: 3,
  });
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'Workspace name is required' });
    minLength(p.name, 2, { message: 'Use at least 2 characters' });
    email(p.email, { message: 'Enter a valid email address' });
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
    this.destroyRef.onDestroy(() => this.revokeLogoUrl());
    this.workspacesApi.getDefault().subscribe({
      next: (ws) => {
        this.workspace.set(ws);
        this.model.set({
          name: ws.name,
          legalName: ws.legalName ?? '',
          email: ws.email ?? '',
          phone: ws.phone ?? '',
          website: ws.website ?? '',
          address: ws.address ?? '',
          city: ws.city ?? '',
          postCode: ws.postCode ?? '',
          country: ws.country ?? '',
          taxCode: ws.taxCode ?? '',
          currency: ws.currency,
          taxRate: Number(ws.taxRate) || 0,
          paymentTerms: ws.paymentTerms,
          invoicePrefix: ws.invoicePrefix ?? '',
          quotePrefix: ws.quotePrefix ?? '',
          footerNote: ws.footerNote ?? '',
          remindersEnabled: ws.remindersEnabled,
          reminderDaysBefore: ws.reminderDaysBefore,
        });
        if (ws.storageKey) this.loadLogo(ws.id);
      },
      error: () => undefined,
    });
  }

  protected saveWorkspace(): void {
    const ws = this.workspace();
    if (!ws || this.f().invalid() || this.savingWorkspace()) return;
    const v = this.model();
    // Nullable strings: empty input clears the stored value.
    const clean = (s: string) => s.trim() || null;
    const body: UpdateWorkspaceRequest = {
      name: v.name.trim(),
      legalName: clean(v.legalName),
      email: clean(v.email),
      phone: clean(v.phone),
      website: clean(v.website),
      address: clean(v.address),
      city: clean(v.city),
      postCode: clean(v.postCode),
      country: clean(v.country),
      taxCode: clean(v.taxCode),
      currency: v.currency,
      taxRate: Math.min(100, Math.max(0, Number(v.taxRate) || 0)),
      paymentTerms: Math.min(365, Math.max(0, Math.round(v.paymentTerms) || 0)),
      invoicePrefix: clean(v.invoicePrefix),
      quotePrefix: clean(v.quotePrefix),
      footerNote: clean(v.footerNote),
      remindersEnabled: v.remindersEnabled,
      // API accepts 1–30 days; clamp what the number input lets through.
      reminderDaysBefore: Math.min(
        30,
        Math.max(1, Math.round(v.reminderDaysBefore) || 3),
      ),
    };
    this.savingWorkspace.set(true);
    this.workspacesApi.update(ws.id, body).subscribe({
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

  protected onLogoSelected(event: Event): void {
    const ws = this.workspace();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!ws || !file || this.logoBusy()) return;
    if (!LOGO_TYPES.includes(file.type)) {
      this.toast.error('Logo must be a PNG or JPEG image');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.toast.error('Logo must be 2MB or smaller');
      return;
    }
    this.logoBusy.set(true);
    this.workspacesApi.uploadLogo(ws.id, file).subscribe({
      next: (updated) => {
        this.logoBusy.set(false);
        this.workspace.set(updated);
        this.setLogoUrl(URL.createObjectURL(file));
        this.toast.success('Logo updated', 'It will appear on invoice and quote PDFs.');
      },
      error: (err) => {
        this.logoBusy.set(false);
        this.toast.error('Could not upload logo', apiErrorMessage(err));
      },
    });
  }

  protected removeLogo(): void {
    const ws = this.workspace();
    if (!ws || this.logoBusy()) return;
    this.logoBusy.set(true);
    this.workspacesApi.deleteLogo(ws.id).subscribe({
      next: (updated) => {
        this.logoBusy.set(false);
        this.workspace.set(updated);
        this.setLogoUrl(null);
        this.toast.success('Logo removed');
      },
      error: (err) => {
        this.logoBusy.set(false);
        this.toast.error('Could not remove logo', apiErrorMessage(err));
      },
    });
  }

  protected deleteWorkspace(): void {
    this.toast.error('Contact support to complete deletion.');
  }

  private loadLogo(id: string): void {
    this.workspacesApi.getLogo(id).subscribe({
      next: (blob) => this.setLogoUrl(URL.createObjectURL(blob)),
      error: () => undefined,
    });
  }

  private setLogoUrl(url: string | null): void {
    this.revokeLogoUrl();
    this.logoUrl.set(url);
  }

  private revokeLogoUrl(): void {
    const current = this.logoUrl();
    if (current) URL.revokeObjectURL(current);
  }
}
