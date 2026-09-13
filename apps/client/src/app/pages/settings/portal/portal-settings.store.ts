import { Injectable, signal } from '@angular/core';

/**
 * Mock, client-side-only state for the Client Portal settings UI. Nothing
 * here talks to the API - the backend endpoints for client portal
 * enablement/permissions don't exist yet, so this store just makes the
 * settings screen interactive to demo the design.
 */

export type PortalCapabilities = {
  viewProjects: boolean;
  viewBudgets: boolean;
  viewTime: boolean;
  viewDocuments: boolean;
  downloadDocuments: boolean;
  uploadDocuments: boolean;
  viewQuotes: boolean;
  approveQuotes: boolean;
  viewInvoices: boolean;
  viewPayments: boolean;
  makePayments: boolean;
  commentOnProjects: boolean;
  receiveNotifications: boolean;
};

export const defaultCapabilities: PortalCapabilities = {
  viewProjects: true,
  viewBudgets: true,
  viewTime: true,
  viewDocuments: true,
  downloadDocuments: true,
  uploadDocuments: false,
  viewQuotes: true,
  approveQuotes: true,
  viewInvoices: true,
  viewPayments: true,
  makePayments: true,
  commentOnProjects: true,
  receiveNotifications: true,
};

export const capabilityMeta: {
  key: keyof PortalCapabilities;
  label: string;
  desc: string;
  group: string;
}[] = [
  { key: 'viewProjects', label: 'View projects', desc: 'See project overview, status and milestones.', group: 'Projects & time' },
  { key: 'viewBudgets', label: 'View budgets', desc: 'See client-facing budget, spend and remaining balance.', group: 'Projects & time' },
  { key: 'viewTime', label: 'View time', desc: 'See hours logged and time breakdowns.', group: 'Projects & time' },
  { key: 'viewDocuments', label: 'View documents', desc: 'See documents shared with them.', group: 'Documents' },
  { key: 'downloadDocuments', label: 'Download documents', desc: 'Save copies of shared documents.', group: 'Documents' },
  { key: 'uploadDocuments', label: 'Upload documents', desc: 'Share files back with your team.', group: 'Documents' },
  { key: 'viewQuotes', label: 'View quotes', desc: 'See quotes and proposals.', group: 'Financials' },
  { key: 'approveQuotes', label: 'Approve quotes', desc: 'Accept or decline quotes in the portal.', group: 'Financials' },
  { key: 'viewInvoices', label: 'View invoices', desc: 'See issued invoices and balances.', group: 'Financials' },
  { key: 'viewPayments', label: 'View payments', desc: 'See payment history and receipts.', group: 'Financials' },
  { key: 'makePayments', label: 'Make payments', desc: 'Pay invoices directly from the portal.', group: 'Financials' },
  { key: 'commentOnProjects', label: 'Messages & comments', desc: 'Message your team and comment on documents.', group: 'Collaboration' },
  { key: 'receiveNotifications', label: 'Receive notifications', desc: 'Get notified about new documents, quotes and invoices.', group: 'Collaboration' },
];

export type ProjectAccess = {
  enabled: boolean;
  useDefaults: boolean;
  overrides: PortalCapabilities;
};

export type ClientPortalUser = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'invited';
  lastLogin?: string;
  projectIds: string[];
};

export const portalRoles = ['Project Manager', 'Finance', 'Director', 'Viewer'];

const uid = () => Math.random().toString(36).slice(2, 10);

@Injectable({ providedIn: 'root' })
export class PortalSettingsStore {
  readonly enabled = signal(true);
  readonly slug = signal('acme-studio');
  readonly welcomeMessage = signal(
    'Welcome to your client portal. Track projects, approve quotes and pay invoices - all in one place.',
  );
  readonly defaults = signal<PortalCapabilities>({ ...defaultCapabilities });

  /** Per-project portal sharing + permission overrides, keyed by the project's real id. */
  readonly projectAccess = signal<Record<string, ProjectAccess>>({});

  readonly clientUsers = signal<ClientPortalUser[]>([]);

  /** Whether a given client's portal is switched on, keyed by the client's real id. */
  readonly clientPortalActive = signal<Record<string, boolean>>({});

  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
  }

  isClientPortalActive(clientId: string): boolean {
    return this.clientPortalActive()[clientId] ?? false;
  }

  setClientPortalActive(clientId: string, active: boolean): void {
    this.clientPortalActive.update((current) => ({ ...current, [clientId]: active }));
  }

  setDefaults(defaults: PortalCapabilities): void {
    this.defaults.set(defaults);
  }

  setSlug(slug: string): void {
    this.slug.set(slug);
  }

  setWelcomeMessage(message: string): void {
    this.welcomeMessage.set(message);
  }

  setProjectAccess(projectId: string, patch: Partial<ProjectAccess>): void {
    this.projectAccess.update((current) => {
      const existing = current[projectId] ?? {
        enabled: false,
        useDefaults: true,
        overrides: { ...this.defaults() },
      };
      return { ...current, [projectId]: { ...existing, ...patch } };
    });
  }

  inviteUser(input: Omit<ClientPortalUser, 'id' | 'status'>): ClientPortalUser {
    const user: ClientPortalUser = { ...input, id: `cu_${uid()}`, status: 'invited' };
    this.clientUsers.update((users) => [...users, user]);
    return user;
  }

  revokeUser(id: string): void {
    this.clientUsers.update((users) => users.filter((u) => u.id !== id));
  }
}
