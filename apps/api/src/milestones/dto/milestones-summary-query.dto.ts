import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class MilestonesSummaryQueryDto {
  @ApiProperty({
    type: String,
    description: 'Comma-separated project ids',
    example: '11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  projectIds: string[];
}
