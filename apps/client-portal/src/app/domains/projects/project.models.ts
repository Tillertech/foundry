export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';

export type MilestoneStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

/** Client-facing subset - no internal notes or effort estimates. */
export interface ProjectMilestone {
  id: string;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  dueDate: string | null;
  completedAt: string | null;
  order: number;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  budget: string;
  hourlyRate: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  milestones: ProjectMilestone[];
  createdAt: string;
  updatedAt: string;
}
