export const WorkspaceEvents = {
  CREATED: 'workspace.created',
  DELETED: 'workspace.deleted',
} as const;

export const ClientEvents = {
  CREATED: 'client.created',
  DELETED: 'client.deleted',
} as const;

/** Payload of every lifecycle event above, and of the project/document ones. */
export interface OwnedRecordEvent {
  /** The record that was created or deleted. */
  id: string;
  /** The owner account (users.id) the workspace belongs to. */
  ownerId: string;
  workspaceId: string;
}

/** `project.moved`: reassigned to a client in another (or the same) workspace. */
export interface ProjectMovedEvent extends OwnedRecordEvent {
  fromWorkspaceId: string;
}

export const AccountExportEvents = {
  /** AccountExportFinishedEvent: a background account export ended. */
  FINISHED: 'account.export_finished',
} as const;

export interface AccountExportFinishedEvent {
  ownerId: string;
  exportId: string;
  ok: boolean;
  /** Set when ok. */
  bytes?: number;
  /** ISO 8601; the download is removed after this. Set when ok. */
  expiresAt?: string;
}
