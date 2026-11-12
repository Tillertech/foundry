import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LineItemEntity } from '../../common/dto/line-item.dto';
import { QuoteItemKind, QuoteStatus } from '../../generated/prisma/enums';
import { CURRENCY_SCHEMA } from '../../common/currency';

export class QuoteDeliverableEntity {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Signed-off MVP feature list' })
  label: string;
}

/** The document fields a quote shows for an attachment - never its storage key. */
export class QuoteAttachmentDocumentEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Master services agreement.pdf' })
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  mimeType: string | null;

  @ApiProperty({ description: 'Bytes' })
  size: number;
}

export class QuoteAttachmentEntity {
  @ApiProperty({ description: 'Display order' })
  position: number;

  @ApiProperty({ type: QuoteAttachmentDocumentEntity })
  document: QuoteAttachmentDocumentEntity;
}

export class QuoteItemEntity extends LineItemEntity {
  @ApiProperty({ format: 'uuid' })
  quoteId: string;

  @ApiProperty({ enum: Object.values(QuoteItemKind), enumName: 'QuoteItemKind' })
  kind: QuoteItemKind;

  @ApiPropertyOptional({ nullable: true, type: String })
  details: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  estimatedHours: number | null;

  @ApiProperty({
    type: [QuoteDeliverableEntity],
    description: 'Milestone/option lines: promised deliverables',
  })
  deliverables: QuoteDeliverableEntity[];

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Milestone/option lines: what the client checks before signing off',
  })
  acceptanceCriteria: string | null;

  @ApiProperty({ description: 'Options only: picked by the client' })
  selected: boolean;

  @ApiProperty({ description: 'Display order' })
  position: number;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    type: String,
    description: 'Milestone generated from this line on conversion',
  })
  milestoneId: string | null;
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

  @ApiProperty(CURRENCY_SCHEMA)
  currency: string;

  @ApiProperty({ type: String, description: 'Percent, decimal serialized as string', example: '0' })
  taxRate: string;

  @ApiProperty({ type: String, description: 'Percent held to the final milestone', example: '10' })
  retentionPercent: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date, description: 'When the client accepted/declined in the portal' })
  respondedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Portal user who answered, "Name <email>"' })
  respondedBy: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Reason given with a decline' })
  responseNote: string | null;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({
    format: 'uuid',
    description: "The client's workspace; quote numbers are unique within it",
  })
  workspaceId: string;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    type: String,
    description: 'Project created from this quote; lines are locked once set',
  })
  projectId: string | null;

  @ApiProperty({ type: [QuoteItemEntity] })
  items: QuoteItemEntity[];

  @ApiProperty({ type: [QuoteAttachmentEntity], description: 'Supporting documents, in order' })
  attachments: QuoteAttachmentEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
