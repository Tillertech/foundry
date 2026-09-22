import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsUUID } from 'class-validator';

export class ReorderMilestonesDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId: string;

  @ApiProperty({
    type: [String],
    description:
      "Every milestone id for the project, in the desired order - must match the project's current milestone set exactly",
  })
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  ids: string[];
}
