import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '../../../generated/prisma/enums';
import { PortalMilestoneEntity } from './portal-milestone.entity';

export class PortalProjectQuoteRefEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Q-2001' })
  number: string;
}

export class PortalProjectEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: Object.values(ProjectStatus), enumName: 'ProjectStatus' })
  status: ProjectStatus;

  @ApiProperty({ type: String, description: 'Decimal serialized as string', example: '24000' })
  budget: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: '150' })
  hourlyRate: string | null;

  @ApiProperty()
  startDate: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  endDate: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ type: PortalMilestoneEntity, isArray: true })
  milestones: PortalMilestoneEntity[];

  @ApiPropertyOptional({
    nullable: true,
    type: PortalProjectQuoteRefEntity,
    description: 'Quote this project was created from (project detail only)',
  })
  quote?: PortalProjectQuoteRefEntity | null;
}
