import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MilestoneStatus } from '../../../generated/prisma/enums';

/** Read-only, client-facing subset of a milestone - no notes or effort estimates. */
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
}
