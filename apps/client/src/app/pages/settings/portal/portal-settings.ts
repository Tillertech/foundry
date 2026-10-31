import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideGlobe } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Field, ToastService } from '@foundry/shared-ui';
import { apiErrorMessage } from '@foundry/shared-util';
import { PortalUsersApiService } from '../../../domains/portal-users';
import { Workspace, WorkspacesApiService } from '../../../domains/workspaces';
import { PortalSettingsStore } from './portal-settings.store';

type PortalDefaultKey =
  | 'portalViewProjects'
  | 'portalViewDocuments'
  | 'portalViewQuotes'
  | 'portalViewPayments';

/**
 * The workspace's default portal permissions - exactly the four view flags
 * the portal API enforces. Anything the portal cannot do yet (uploads, quote
 * approval, online payment, messaging) has no switch here on purpose: it
 * would be a control with nothing behind it.
 */
const portalDefaults: { key: PortalDefaultKey; label: string; desc: string }[] =
  [
    {
      key: 'portalViewProjects',
      label: 'Projects',
      desc: 'Shared projects with their status, budget and milestones.',
    },
    {
      key: 'portalViewDocuments',
      label: 'Documents',
      desc: 'View and download documents filed under the client or a shared project.',
    },
    {
      key: 'portalViewQuotes',
      label: 'Quotes',
      desc: 'Quotes and proposals sent to the client.',
    },
    {
      key: 'portalViewPayments',
      label: 'Invoices & payments',
      desc: 'Invoices with PDF download, and the payments received against them.',
    },
  ];

@Component({
  selector: 'app-portal-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmInput, HlmTextarea, HlmSwitchImports, Field],
  providers: [provideIcons({ lucideCopy, lucideGlobe })],
  templateUrl: './portal-settings.html',
})
export class PortalSettings {
  protected readonly store = inject(PortalSettingsStore);

  private readonly workspacesApi = inject(WorkspacesApiService);
  private readonly portalUsersApi = inject(PortalUsersApiService);
  private readonly toast = inject(ToastService);

  protected readonly portalDefaults = portalDefaults;
  protected readonly workspace = signal<Workspace | null>(null);
  protected readonly loadingDefaults = signal(true);
  /** Flag currently being saved, so its switch can't be flipped twice. */
  protected readonly savingDefault = signal<PortalDefaultKey | null>(null);

  constructor() {
    // Only the totals are needed, so ask for a single row and read `count`.
    this.portalUsersApi.list({ status: 'active', take: 1 }).subscribe({
      next: (res) => this.activeUsers.set(res.count ?? res.results.length),
      error: () => undefined,
    });
    this.portalUsersApi.list({ status: 'invited', take: 1 }).subscribe({
      next: (res) => this.invitedUsers.set(res.count ?? res.results.length),
      error: () => undefined,
    });
    this.workspacesApi.current().subscribe({
      next: (ws) => {
        this.workspace.set(ws);
        this.loadingDefaults.set(false);
      },
      error: (err) => {
        this.loadingDefaults.set(false);
        this.toast.error(
          'Could not load portal defaults',
          apiErrorMessage(err),
        );
      },
    });
  }

  protected readonly portalUrl = computed(
    () => `https://foundryinstance/${this.store.slug()}`,
  );
  /** Across every client portal of the workspace; null until counted. */
  protected readonly activeUsers = signal<number | null>(null);
  protected readonly invitedUsers = signal<number | null>(null);

  protected readonly slugDraft = signal(this.store.slug());
  protected readonly welcomeDraft = signal(this.store.welcomeMessage());

  protected copyPortalUrl(): void {
    navigator.clipboard?.writeText(this.portalUrl());
  }

  protected toggleDefault(key: PortalDefaultKey, value: boolean): void {
    const ws = this.workspace();
    if (!ws || this.savingDefault()) return;
    // Optimistic: flip now, put it back if the save is rejected.
    this.workspace.set({ ...ws, [key]: value });
    this.savingDefault.set(key);
    this.workspacesApi.update(ws.id, { [key]: value }).subscribe({
      next: (updated) => {
        this.workspace.set(updated);
        this.savingDefault.set(null);
        this.toast.success('Default permissions updated');
      },
      error: (err) => {
        this.workspace.set(ws);
        this.savingDefault.set(null);
        this.toast.error(
          'Could not update default permissions',
          apiErrorMessage(err),
        );
      },
    });
  }

  protected saveBranding(): void {
    this.store.setSlug(this.slugDraft());
    this.store.setWelcomeMessage(this.welcomeDraft());
  }

  protected onSlugInput(value: string): void {
    this.slugDraft.set(value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  }
}
