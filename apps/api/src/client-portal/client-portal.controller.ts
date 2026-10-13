import {
  Body,
  Controller,
  Delete,
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
import { ClientPortalService } from './client-portal.service';
import { CreateClientPortalDto } from './dto/create-client-portal.dto';
import { ListClientPortalsQueryDto } from './dto/list-client-portals-query.dto';
import { SharePortalProjectDto } from './dto/share-portal-project.dto';
import { UpdateClientPortalDto } from './dto/update-client-portal.dto';
import { ClientPortalEntity } from './entities/client-portal.entity';

@ApiTags('client-portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('client-portal')
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Post()
  @ApiOperation({ summary: 'Provision (or fetch, if it already exists) a client portal' })
  @ApiCreatedResponse({ type: ClientPortalEntity })
  @ApiNotFoundResponse()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateClientPortalDto) {
    return this.clientPortalService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List client portals (cursor paginated)' })
  @ApiPaginatedResponse(ClientPortalEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListClientPortalsQueryDto,
    @Req() req: Request,
  ) {
    return this.clientPortalService.findAll(user.sub, query, requestBaseUrl(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a client portal' })
  @ApiOkResponse({ type: ClientPortalEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.clientPortalService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary:
      'Toggle a portal and/or set its permissions (inherit the workspace defaults, or its own)',
   })
  @ApiOkResponse({ type: ClientPortalEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientPortalDto,
  ) {
    return this.clientPortalService.update(user.sub, id, dto);
  }

  @Patch(':id/projects/:projectId')
  @ApiOperation({
    summary: 'Share a project into the portal, or hide it again',
  })
  @ApiOkResponse({ type: ClientPortalEntity })
  @ApiNotFoundResponse({
    description: "Portal not found, or the project is not this client's",
  })
  shareProject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SharePortalProjectDto,
  ) {
    return this.clientPortalService.setProjectShared(
      user.sub,
      id,
      projectId,
      dto.active,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a client portal (cascades to its users and project shares)' })
  @ApiOkResponse({ type: ClientPortalEntity })
  @ApiNotFoundResponse()
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.clientPortalService.remove(user.sub, id);
  }
}
