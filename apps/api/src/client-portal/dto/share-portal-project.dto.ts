import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SharePortalProjectDto {
  @ApiProperty({
    description: 'Whether the project is visible in the client portal',
  })
  @IsBoolean()
  active: boolean;
}
