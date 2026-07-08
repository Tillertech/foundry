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
import { ListTimelineQueryDto } from '../reconciliation/dto/list-timeline-query.dto';
import { ReconciliationEntryEntity } from '../reconciliation/entities/reconciliation-entry.entity';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectEntity } from './entities/project.entity';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a project for a client' })
  @ApiCreatedResponse({ type: ProjectEntity })
  @ApiNotFoundResponse({ description: 'Client not found' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects (cursor paginated)' })
  @ApiPaginatedResponse(ProjectEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListProjectsQueryDto,
    @Req() req: Request,
  ) {
    return this.projectsService.findAll(user.sub, query, requestBaseUrl(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project' })
  @ApiOkResponse({ type: ProjectEntity })
  @ApiNotFoundResponse()
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projectsService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiOkResponse({ type: ProjectEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  @ApiOkResponse({ type: ProjectEntity })
  @ApiNotFoundResponse()
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projectsService.remove(user.sub, id);
  }

  @Get(':id/timeline')
  @ApiOperation({
    summary: 'Reconciliation timeline for the project (cursor paginated)',
    description:
      'Every payment applied, adjusted or reversed across the project invoices, with invoice and project balances after each entry.',
  })
  @ApiPaginatedResponse(ReconciliationEntryEntity)
  @ApiNotFoundResponse()
  async timeline(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTimelineQueryDto,
    @Req() req: Request,
  ) {
    await this.projectsService.findOne(user.sub, id);
    return this.reconciliation.timeline(
      user.sub,
      { projectId: id },
      query,
      requestBaseUrl(req),
    );
  }
}
