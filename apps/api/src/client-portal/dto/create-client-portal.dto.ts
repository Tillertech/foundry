import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class CreateClientPortalDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The client to provision a portal for. Must belong to a workspace owned by the caller.',
  })
  @IsUUID()
  clientId: string;
}
