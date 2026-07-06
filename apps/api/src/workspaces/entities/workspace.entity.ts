import { ApiProperty } from '@nestjs/swagger';
import { ClientStatus, Currency } from '../../generated/prisma/enums';

export class WorkspaceEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: Object.values(Currency), enumName: 'Currency' })
  currency: Currency;

  @ApiProperty({ enum: Object.values(ClientStatus), enumName: 'ClientStatus' })
  status: ClientStatus;

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
