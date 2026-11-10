import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MilestoneStatus } from '../../../generated/prisma/enums';

export class PortalMilestoneDeliverableEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  done: boolean;
}

/** Read-only, client-facing subset of a milestone - no notes, effort estimates or billing. */
export class PortalMilestoneEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ enum: Object.values(MilestoneStatus), enumName: 'MilestoneStatus' })
  status: MilestoneStatus;

  @ApiPropertyOptional({ nullable: true, type: Date })
  dueDate: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  completedAt: Date | null;

  @ApiProperty({ description: 'Position within the project milestone list (lower sorts first)' })
  order: number;

  @ApiProperty({ type: [PortalMilestoneDeliverableEntity] })
  deliverables: PortalMilestoneDeliverableEntity[];

  @ApiPropertyOptional({ nullable: true, type: String })
  acceptanceCriteria: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  deliveredAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  acceptedAt: Date | null;
}
