import { ClientStatus, Currency } from '../shared/models';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  currency: Currency;
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
  currency?: Currency;
  status?: ClientStatus;
  remindersEnabled?: boolean;
  reminderDaysBefore?: number;
}

export type UpdateWorkspaceRequest = Partial<CreateWorkspaceRequest>;
