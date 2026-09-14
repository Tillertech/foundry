import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { requestBaseUrl } from '../../common/http/request-base-url';
import { ApiPaginatedResponse } from '../../common/swagger/api-paginated-response.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentPortalUser } from '../../portal-auth/decorators/current-portal-user.decorator';
import {
  PortalJwtAuthGuard,
  PortalJwtPayload,
} from '../../portal-auth/portal-jwt-auth.guard';
import { PortalProjectEntity } from './entities/portal-project.entity';
import { PortalProjectsService } from './portal-projects.service';

@ApiTags('portal-projects')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/projects')
export class PortalProjectsController {
  constructor(private readonly service: PortalProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects shared with the signed-in portal user' })
  @ApiPaginatedResponse(PortalProjectEntity)
  @ApiForbiddenResponse({ description: 'Projects are not enabled for this portal' })
  findAll(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Query() query: PaginationQueryDto,
    @Req() req: Request,
  ) {
    return this.service.findAll(
      user.clientPortalId,
      query,
      requestBaseUrl(req),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one shared project' })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Projects are not enabled for this portal' })
  findOne(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.clientPortalId, id);
  }
}
