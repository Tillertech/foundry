import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '../../generated/prisma/enums';

export class ProjectEntity {
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

  @ApiProperty({ format: 'uuid' })
  clientId: string;
}
