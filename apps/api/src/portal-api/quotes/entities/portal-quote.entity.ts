import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LineItemEntity } from '../../../common/dto/line-item.dto';
import { QuoteItemKind, QuoteStatus } from '../../../generated/prisma/enums';
import { CURRENCY_SCHEMA } from '../../../common/currency';

export class PortalQuoteItemEntity extends LineItemEntity {
  @ApiProperty({ enum: Object.values(QuoteItemKind), enumName: 'QuoteItemKind' })
  kind: QuoteItemKind;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Client-facing scope' })
  details: string | null;

  @ApiProperty({ description: 'Options only: included in the quote' })
  selected: boolean;

  @ApiProperty({ description: 'Display order' })
  position: number;
}

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

  @ApiProperty({ type: String, description: 'Percent held to the final milestone', example: '10' })
  retentionPercent: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date, description: 'When the client accepted or declined' })
  respondedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Portal user who answered' })
  respondedBy: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Reason given with a decline' })
  responseNote: string | null;

  @ApiProperty({ type: [PortalQuoteItemEntity] })
  items: PortalQuoteItemEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
