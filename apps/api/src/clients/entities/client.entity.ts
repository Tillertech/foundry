import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientStatus, Currency } from '../../generated/prisma/enums';

export class ClientEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  company: string | null;

  @ApiProperty({ enum: Object.values(Currency), enumName: 'Currency' })
  currency: Currency;

  @ApiProperty({ enum: Object.values(ClientStatus), enumName: 'ClientStatus' })
  status: ClientStatus;

  @ApiPropertyOptional({ nullable: true, type: String })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  taxId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  address: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ format: 'uuid' })
  workspaceId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
