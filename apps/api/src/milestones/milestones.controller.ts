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
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../identity/auth/jwt-auth.guard';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { ListMilestonesQueryDto } from './dto/list-milestones-query.dto';
import { MilestonesSummaryQueryDto } from './dto/milestones-summary-query.dto';
import { ReorderMilestonesDto } from './dto/reorder-milestones.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { MilestoneEntity } from './entities/milestone.entity';
import { ProjectMilestonesSummaryEntity } from './entities/project-milestones-summary.entity';
import { MilestonesService } from './milestones.service';

@ApiTags('milestones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('milestones')
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Post()
  @ApiOperation({ summary: 'Add a milestone to a project' })
  @ApiCreatedResponse({ type: MilestoneEntity })
  @ApiNotFoundResponse({ description: 'Project not found' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMilestoneDto) {
    return this.milestones.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      "A project's milestones, ordered by position (not cursor paginated - a bounded, reorderable list)",
  })
  @ApiOkResponse({ type: MilestoneEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Project not found' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMilestonesQueryDto,
  ) {
    return this.milestones.findAllForProject(user.sub, query.projectId);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Milestone progress per project, for rendering project cards without one request each',
  })
  @ApiOkResponse({ type: ProjectMilestonesSummaryEntity, isArray: true })
  summary(
    @CurrentUser() user: JwtPayload,
    @Query() query: MilestonesSummaryQueryDto,
  ) {
    return this.milestones.summaryForProjects(user.sub, query.projectIds);
  }

  @Post('reorder')
  @ApiOperation({ summary: "Persist a full reordering of a project's milestones" })
  @ApiOkResponse({ type: MilestoneEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Project not found' })
  reorder(@CurrentUser() user: JwtPayload, @Body() dto: ReorderMilestonesDto) {
    return this.milestones.reorder(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a milestone' })
  @ApiOkResponse({ type: MilestoneEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.milestones.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a milestone' })
  @ApiOkResponse({ type: MilestoneEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.milestones.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a milestone' })
  @ApiOkResponse({ type: MilestoneEntity })
  @ApiNotFoundResponse()
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.milestones.remove(user.sub, id);
  }
}
