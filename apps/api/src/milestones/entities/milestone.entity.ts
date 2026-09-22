import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MilestoneStatus } from '../../generated/prisma/enums';

export class MilestoneEntity {
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

  @ApiPropertyOptional({ nullable: true, type: Number })
  estimatedHours: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ description: 'Position within the project milestone list (lower sorts first)' })
  order: number;

  @ApiProperty({ format: 'uuid' })
  projectId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
