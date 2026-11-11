import {
  Body,
  Controller,
  HttpCode,
  Post,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
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
import { PortalProjectFinancialsEntity } from '../billing/portal-billing.entities';
import { PortalBillingService } from '../billing/portal-billing.service';
import { ReviewMilestoneDto } from './dto/review-milestone.dto';
import { PortalMilestoneReviewService } from './portal-milestone-review.service';
import { PortalMilestoneEntity } from './entities/portal-milestone.entity';
import { PortalProjectEntity } from './entities/portal-project.entity';
import { PortalProjectsService } from './portal-projects.service';

@ApiTags('portal-projects')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/projects')
export class PortalProjectsController {
  constructor(
    private readonly service: PortalProjectsService,
    private readonly billing: PortalBillingService,
    private readonly reviews: PortalMilestoneReviewService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List projects shared with the signed-in portal user',
  })
  @ApiPaginatedResponse(PortalProjectEntity)
  @ApiForbiddenResponse({
    description: 'Projects are not enabled for this portal',
  })
  findAll(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Query() query: PaginationQueryDto,
    @Req() req: Request,
  ) {
    return this.service.findAll(
      user.clientPortalId,
      user.sub,
      query,
      requestBaseUrl(req),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one shared project' })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description: 'Projects are not enabled for this portal',
  })
  findOne(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.clientPortalId, user.sub, id);
  }

  @Post(':id/milestones/:milestoneId/review')
  @HttpCode(204)
  @ApiOperation({
    summary:
      "Answer a delivered milestone: approve (signs it off; priced milestones raise their invoice) or request changes (back to in progress with feedback). Needs the user's canApproveMilestones.",
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Projects disabled, or the user may not approve milestones' })
  @ApiConflictResponse({ description: 'Not waiting for review, or just reviewed' })
  @ApiBadRequestResponse({ description: 'No feedback with a change request, criteria not confirmed, unknown deliverable' })
  review(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body() dto: ReviewMilestoneDto,
  ) {
    return this.reviews.review(user.clientPortalId, user.sub, id, milestoneId, dto);
  }

  @Get(':id/financials')
  @ApiOperation({
    summary:
      "The project's financial position: budget, invoiced, paid, outstanding/overdue, still to invoice, retention held and the next payment due (needs both viewProjects and viewPayments)",
  })
  @ApiOkResponse({ type: PortalProjectFinancialsEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Projects or payments are not enabled for this portal' })
  financials(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.billing.projectFinancials(user.clientPortalId, user.sub, id);
  }

  @Get(':id/milestones/:milestoneId')
  @ApiOperation({
    summary:
      'Get one milestone of a shared project (live updates swap just this)',
  })
  @ApiOkResponse({ type: PortalMilestoneEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description: 'Projects are not enabled for this portal',
  })
  findMilestone(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
  ) {
    return this.service.findMilestone(
      user.clientPortalId,
      user.sub,
      id,
      milestoneId,
    );
  }
}
