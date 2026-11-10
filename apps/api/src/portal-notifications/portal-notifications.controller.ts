import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { requestBaseUrl } from '../common/http/request-base-url';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator';
import { CurrentPortalUser } from '../portal-auth/decorators/current-portal-user.decorator';
import {
  PortalJwtAuthGuard,
  PortalJwtPayload,
} from '../portal-auth/portal-jwt-auth.guard';
import { ListPortalNotificationsQueryDto } from './dto/list-portal-notifications-query.dto';
import {
  PortalNotificationEntity,
  PortalUnreadCountEntity,
} from './entities/portal-notification.entity';
import { PortalNotificationsService } from './portal-notifications.service';

@ApiTags('portal-notifications')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/notifications')
export class PortalNotificationsController {
  constructor(private readonly service: PortalNotificationsService) {}

  @Get()
  @ApiOperation({
    summary: "The portal user's notifications (cursor paginated, newest first)",
  })
  @ApiPaginatedResponse(PortalNotificationEntity)
  findAll(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Query() query: ListPortalNotificationsQueryDto,
    @Req() req: Request,
  ) {
    return this.service.list(user.sub, query, requestBaseUrl(req));
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications' })
  @ApiOkResponse({ type: PortalUnreadCountEntity })
  unreadCount(@CurrentPortalUser() user: PortalJwtPayload) {
    return this.service.unreadCount(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification read' })
  @ApiOkResponse({ type: PortalNotificationEntity })
  @ApiNotFoundResponse()
  markRead(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.markRead(user.sub, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  @ApiOkResponse({ type: PortalUnreadCountEntity })
  markAllRead(@CurrentPortalUser() user: PortalJwtPayload) {
    return this.service.markAllRead(user.sub);
  }
}
