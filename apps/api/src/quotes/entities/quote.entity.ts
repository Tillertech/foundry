import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LineItemEntity } from '../../common/dto/line-item.dto';
import { Currency, QuoteStatus } from '../../generated/prisma/enums';

export class QuoteItemEntity extends LineItemEntity {
  @ApiProperty({ format: 'uuid' })
  quoteId: string;
}

export class QuoteEntity {
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

  @ApiProperty({ enum: Object.values(Currency), enumName: 'Currency' })
  currency: Currency;

  @ApiProperty({ type: String, description: 'Percent, decimal serialized as string', example: '0' })
  taxRate: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({ type: [QuoteItemEntity] })
  items: QuoteItemEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
