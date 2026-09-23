import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ListMilestonesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId: string;
}
