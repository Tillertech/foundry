import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InvoiceStatus,
  MilestoneBillingTrigger,
  MilestoneReviewDecision,
  MilestoneStatus,
} from '../../generated/prisma/enums';

export class DeliverableLinkEntity {
  @ApiProperty()
  label: string;

  @ApiProperty()
  url: string;
}

export class MilestoneDeliverableEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  done: boolean;

  @ApiPropertyOptional({ type: String })
  note?: string;

  @ApiPropertyOptional({ type: [DeliverableLinkEntity] })
  links?: DeliverableLinkEntity[];

  @ApiPropertyOptional({ type: [String], description: 'Evidence document ids' })
  documentIds?: string[];
}

export class MilestoneReviewCommentEntity {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null = the milestone as a whole' })
  deliverableId: string | null;

  @ApiProperty()
  body: string;
}

export class MilestoneReviewEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: '1 for the first hand-over, 2 after one round of changes...' })
  round: number;

  @ApiProperty({ enum: Object.values(MilestoneReviewDecision), enumName: 'MilestoneReviewDecision' })
  decision: MilestoneReviewDecision;

  @ApiProperty({ type: [MilestoneReviewCommentEntity] })
  comments: MilestoneReviewCommentEntity[];

  @ApiProperty()
  criteriaConfirmed: boolean;

  @ApiProperty()
  reviewerName: string;

  @ApiProperty()
  reviewerEmail: string;

  @ApiProperty()
  createdAt: Date;
}

export class MilestoneInvoiceSummaryEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'INV-1004' })
  number: string;

  @ApiProperty({ enum: Object.values(InvoiceStatus), enumName: 'InvoiceStatus' })
  status: InvoiceStatus;
}

export class MilestoneEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ enum: Object.values(MilestoneStatus), enumName: 'MilestoneStatus' })
  status: MilestoneStatus;

  @ApiPropertyOptional({ nullable: true, type: Date })
  dueDate: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  completedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  estimatedHours: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ description: 'Position within the project milestone list (lower sorts first)' })
  order: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "Fixed price in the client's currency, decimal as string",
    example: '50000',
  })
  amount: string | null;

  @ApiProperty({
    enum: Object.values(MilestoneBillingTrigger),
    enumName: 'MilestoneBillingTrigger',
  })
  billingTrigger: MilestoneBillingTrigger;

  @ApiProperty()
  releasesRetention: boolean;

  @ApiProperty({ type: String, description: 'Retention held on its invoice', example: '0' })
  retainedAmount: string;

  @ApiProperty({ type: [MilestoneDeliverableEntity] })
  deliverables: MilestoneDeliverableEntity[];

  @ApiPropertyOptional({ nullable: true, type: String })
  acceptanceCriteria: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  deliveredAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  acceptedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  acceptedBy: string | null;

  @ApiPropertyOptional({ nullable: true, type: MilestoneInvoiceSummaryEntity })
  invoice: MilestoneInvoiceSummaryEntity | null;

  @ApiProperty({ type: [MilestoneReviewEntity], description: 'Client review rounds, oldest first' })
  reviews: MilestoneReviewEntity[];

  @ApiProperty({ format: 'uuid' })
  projectId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
