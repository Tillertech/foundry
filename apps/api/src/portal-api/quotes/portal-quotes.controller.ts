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
import { PortalQuoteEntity } from './entities/portal-quote.entity';
import { PortalQuotesService } from './portal-quotes.service';

@ApiTags('portal-quotes')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/quotes')
export class PortalQuotesController {
  constructor(private readonly service: PortalQuotesService) {}

  @Get()
  @ApiOperation({ summary: 'List quotes (cursor paginated)' })
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
}
