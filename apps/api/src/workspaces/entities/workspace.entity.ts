import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientStatus, Currency } from '../../generated/prisma/enums';

export class WorkspaceEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Registered legal entity name, when it differs from the trading name',
  })
  legalName: string | null;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  email: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  website: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  address: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  city: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  postCode: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  country: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Tax / VAT registration number shown on documents',
  })
  taxCode: string | null;

  @ApiProperty({ enum: Object.values(Currency), enumName: 'Currency' })
  currency: Currency;

  @ApiProperty({
    type: String,
    description:
      'Default tax rate (percent) for new invoices and quotes, decimal serialized as string',
    example: '16',
  })
  taxRate: string;

  @ApiProperty({
    default: 7,
    description: 'Default payment terms in days for new invoices',
  })
  paymentTerms: number;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'INV-' })
  invoicePrefix: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'Q-' })
  quotePrefix: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Footer note printed on invoices and quotes',
  })
  footerNote: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Storage key of the workspace logo; fetch it via GET /workspaces/:id/logo',
  })
  storageKey: string | null;

  @ApiProperty({ enum: Object.values(ClientStatus), enumName: 'ClientStatus' })
  status: ClientStatus;

  @ApiProperty({
    default: false,
    description: 'Send scheduled invoice due-date reminder emails',
  })
  remindersEnabled: boolean;

  @ApiProperty({
    default: 3,
    description:
      'Days before the due date reminders start (also the re-send interval)',
  })
  reminderDaysBefore: number;

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
