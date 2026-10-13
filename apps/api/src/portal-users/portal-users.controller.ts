import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { PortalUsersService } from './portal-users.service';
import { CreatePortalUserDto } from './dto/create-portal-user.dto';
import { ListPortalUsersQueryDto } from './dto/list-portal-users-query.dto';
import { UpdatePortalUserDto } from './dto/update-portal-user.dto';
import { PortalUserEntity } from './entities/portal-user.entity';

@ApiTags('portal-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portal-users')
export class PortalUsersController {
  constructor(private readonly portalUsersService: PortalUsersService) {}

  @Post()
  @ApiOperation({ summary: 'Invite a user into a client portal' })
  @ApiCreatedResponse({ type: PortalUserEntity })
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Invalid project selection' })
  @ApiConflictResponse({ description: 'Email already invited to this portal' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePortalUserDto) {
    return this.portalUsersService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List portal users (cursor paginated)' })
  @ApiPaginatedResponse(PortalUserEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListPortalUsersQueryDto,
    @Req() req: Request,
  ) {
    return this.portalUsersService.findAll(user.sub, query, requestBaseUrl(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a portal user' })
  @ApiOkResponse({ type: PortalUserEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.portalUsersService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary:
      'Update a portal user: profile, project access, or suspend/reactivate' })
  @ApiOkResponse({ type: PortalUserEntity })
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({
    description: 'Invalid project selection, or activating an invited user',
  })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePortalUserDto,
  ) {
    return this.portalUsersService.update(user.sub, id, dto);
  }

  @Post(':id/resend-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email a fresh invite link to a user who has not accepted yet',
  })
  @ApiOkResponse({ type: PortalUserEntity })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'The invite was already accepted' })
  resendInvite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalUsersService.resendInvite(user.sub, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a portal user\'s access' })
  @ApiOkResponse({ type: PortalUserEntity })
  @ApiNotFoundResponse()
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.portalUsersService.remove(user.sub, id);
  }
}
