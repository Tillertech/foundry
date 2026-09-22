export type MilestoneStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export interface Milestone {
  id: string;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  dueDate: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  notes: string | null;
  /** Position within the project's milestone list (lower sorts first). */
  order: number;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilestoneRequest {
  projectId: string;
  name: string;
  description?: string;
  status?: MilestoneStatus;
  dueDate?: string;
  estimatedHours?: number;
  notes?: string;
  order?: number;
}

export type UpdateMilestoneRequest = Partial<
  Omit<CreateMilestoneRequest, 'projectId' | 'order'>
>;

export interface ReorderMilestonesRequest {
  projectId: string;
  /** Every milestone id for the project, in the desired order. */
  ids: string[];
}

/** Progress rollup for a project's card on the listing page. */
export interface ProjectMilestonesSummary {
  projectId: string;
  total: number;
  completed: number;
  progress: number | null;
  currentMilestoneName: string | null;
}
