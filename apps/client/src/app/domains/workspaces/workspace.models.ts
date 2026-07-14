import { ClientStatus, Currency } from '../shared/models';

export interface Workspace {
  id: string;
  /** Trading name shown across the app and on documents. */
  name: string;
  /** Registered legal entity name, when it differs from the trading name. */
  legalName: string | null;
  slug: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  postCode: string | null;
  country: string | null;
  taxCode: string | null;
  currency: Currency;
  taxRate: string;
  paymentTerms: number;
  invoicePrefix: string | null;
  quotePrefix: string | null;
  footerNote: string | null;
  storageKey: string | null;
  status: ClientStatus;
  /** Scheduled invoice due-date reminder emails on/off. */
  remindersEnabled: boolean;
  /** Days before the due date reminders start (also the re-send interval). */
  reminderDaysBefore: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  postCode?: string | null;
  country?: string | null;
  taxCode?: string | null;
  currency?: Currency;
  taxRate?: number;
  paymentTerms?: number;
  invoicePrefix?: string | null;
  quotePrefix?: string | null;
  footerNote?: string | null;
  status?: ClientStatus;
  remindersEnabled?: boolean;
  reminderDaysBefore?: number;
}

export type UpdateWorkspaceRequest = Partial<CreateWorkspaceRequest>;
