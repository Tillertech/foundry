import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PortalNotificationKind } from '../../generated/prisma/enums';

export class PortalNotificationEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: Object.values(PortalNotificationKind),
    enumName: 'PortalNotificationKind',
  })
  kind: PortalNotificationKind;

  @ApiProperty({ example: 'New quote Q-2041' })
  title: string;

  @ApiProperty({ example: 'Acme Studio sent you a quote for KES 464,000.00.' })
  body: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Quote, invoice, document or project id the notification opens',
  })
  resourceId: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  readAt: Date | null;

  @ApiProperty({ format: 'uuid' })
  clientPortalUserId: string;

  @ApiProperty()
  createdAt: Date;
}

export class PortalUnreadCountEntity {
  @ApiProperty({ example: 2 })
  count: number;
}
