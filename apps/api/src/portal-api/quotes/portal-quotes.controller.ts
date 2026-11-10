import {
  Body,
  Controller,
  Get,
  Post,
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
import {
  AcceptPortalQuoteDto,
  DeclinePortalQuoteDto,
} from './dto/respond-portal-quote.dto';
import { PortalQuoteEntity } from './entities/portal-quote.entity';
import { PortalQuotesService } from './portal-quotes.service';

@ApiTags('portal-quotes')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/quotes')
export class PortalQuotesController {
  constructor(private readonly service: PortalQuotesService) {}

  @Get()
  @ApiOperation({ summary: 'List sent quotes (drafts are never shown; cursor paginated)' })
  @ApiPaginatedResponse(PortalQuoteEntity)
  @ApiForbiddenResponse({ description: 'Quotes are not enabled for this portal' })
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
  @ApiOperation({ summary: 'Get a quote' })
  @ApiOkResponse({ type: PortalQuoteEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Quotes are not enabled for this portal' })
  findOne(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.clientPortalId, id);
  }

  @Post(':id/accept')
  @ApiOperation({
    summary:
      'Accept a sent quote, optionally choosing which options to include. The workspace is notified and starts the project.',
  })
  @ApiOkResponse({ type: PortalQuoteEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Quotes are not enabled for this portal' })
  @ApiConflictResponse({ description: 'Already answered, or no longer open' })
  @ApiBadRequestResponse({ description: 'Expired, or an unknown option id' })
  accept(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptPortalQuoteDto,
  ) {
    return this.service.accept(user.clientPortalId, user.sub, id, dto);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline a sent quote, optionally saying why' })
  @ApiOkResponse({ type: PortalQuoteEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Quotes are not enabled for this portal' })
  @ApiConflictResponse({ description: 'Already answered, or no longer open' })
  @ApiBadRequestResponse({ description: 'Expired' })
  decline(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclinePortalQuoteDto,
  ) {
    return this.service.decline(user.clientPortalId, user.sub, id, dto);
  }
}
