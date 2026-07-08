import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationKind } from '../../generated/prisma/enums';

export class NotificationEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: Object.values(NotificationKind),
    enumName: 'NotificationKind',
  })
  kind: NotificationKind;

  @ApiProperty({ example: 'Invoice INV-1001 sent' })
  title: string;

  @ApiProperty({
    example: 'Invoice INV-1001 was emailed to Acme Corp (billing@acme.com).',
  })
  body: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Id of the invoice, quote or document the notification is about',
  })
  resourceId: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  readAt: Date | null;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  createdAt: Date;
}

export class UnreadCountEntity {
  @ApiProperty({ example: 3 })
  count: number;
}
