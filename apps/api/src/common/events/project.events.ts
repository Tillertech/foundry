import type {
  ClientModel as Client,
  ProjectModel as Project,
} from '../../generated/prisma/models';
import { ProjectStatus } from '../../generated/prisma/enums';

export const ProjectEvents = {
  STATUS_CHANGED: 'project.status_changed',
} as const;

/** Emitted when an update changes a project's status. */
export interface ProjectStatusChangedEvent {
  project: Project;
  previousStatus: ProjectStatus;
  client: Client;
}
