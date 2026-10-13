import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LineItemEntity } from '../../../common/dto/line-item.dto';
import { QuoteStatus } from '../../../generated/prisma/enums';
import { CURRENCY_SCHEMA } from '../../../common/currency';

export class PortalQuoteItemEntity extends LineItemEntity {}

export class PortalQuoteEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Q-2041' })
  number: string;

  @ApiProperty({ enum: Object.values(QuoteStatus), enumName: 'QuoteStatus' })
  status: QuoteStatus;

  @ApiProperty()
  issueDate: Date;

  @ApiProperty()
  validUntil: Date;

  @ApiProperty(CURRENCY_SCHEMA)
  currency: string;

  @ApiProperty({ type: String, description: 'Percent, decimal serialized as string', example: '0' })
  taxRate: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ type: [PortalQuoteItemEntity] })
  items: PortalQuoteItemEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
