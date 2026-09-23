import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectMilestonesSummaryEntity {
  @ApiProperty({ format: 'uuid' })
  projectId: string;

  @ApiProperty({ description: 'Milestone count, excluding cancelled ones' })
  total: number;

  @ApiProperty()
  completed: number;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Percent complete (0-100); null when the project has no milestones',
  })
  progress: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Name of the single in-progress milestone, if any',
  })
  currentMilestoneName: string | null;
}
