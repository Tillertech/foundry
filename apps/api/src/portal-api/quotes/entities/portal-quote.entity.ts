import { PortalProjectRefEntity } from '../../billing/portal-billing.entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LineItemEntity } from '../../../common/dto/line-item.dto';
import { QuoteItemKind, QuoteStatus } from '../../../generated/prisma/enums';
import { CURRENCY_SCHEMA } from '../../../common/currency';
import {
  QuoteAttachmentEntity,
  QuoteDeliverableEntity,
} from '../../../quotes/entities/quote.entity';

export class PortalQuoteItemEntity extends LineItemEntity {
  @ApiProperty({ enum: Object.values(QuoteItemKind), enumName: 'QuoteItemKind' })
  kind: QuoteItemKind;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Client-facing scope' })
  details: string | null;

  @ApiProperty({ type: [QuoteDeliverableEntity], description: 'Milestone/option lines: what will be handed over' })
  deliverables: QuoteDeliverableEntity[];

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Milestone/option lines: what you check before signing off',
  })
  acceptanceCriteria: string | null;

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

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Project started from this quote - only when shared with you (null otherwise)',
  })
  projectId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: PortalProjectRefEntity,
    description: 'Project started from this quote - only when shared with you',
  })
  project: PortalProjectRefEntity | null;

  @ApiProperty({ type: [PortalQuoteItemEntity] })
  items: PortalQuoteItemEntity[];

  @ApiProperty({
    type: [QuoteAttachmentEntity],
    description: 'Supporting documents; download via /portal/quotes/:id/attachments/:documentId/download',
  })
  attachments: QuoteAttachmentEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
