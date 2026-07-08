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
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../identity/auth/jwt-auth.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationEntity,
  UnreadCountEntity,
} from './entities/notification.entity';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'List in-app notifications (cursor paginated, newest first)',
  })
  @ApiPaginatedResponse(NotificationEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListNotificationsQueryDto,
    @Req() req: Request,
  ) {
    return this.notifications.list(user.sub, query, requestBaseUrl(req));
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications' })
  @ApiOkResponse({ type: UnreadCountEntity })
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notifications.unreadCount(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification read' })
  @ApiOkResponse({ type: NotificationEntity })
  @ApiNotFoundResponse()
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(user.sub, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  @ApiOkResponse({ type: UnreadCountEntity })
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }
}
