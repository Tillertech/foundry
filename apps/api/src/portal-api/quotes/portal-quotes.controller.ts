import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
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
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { requestBaseUrl } from '../../common/http/request-base-url';
import { ApiPaginatedResponse } from '../../common/swagger/api-paginated-response.decorator';
import { PortalQuotesQueryDto } from './dto/portal-quotes-query.dto';
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
  @ApiOperation({
    summary:
      'List sent quotes (drafts are never shown; cursor paginated; ?status= and ?projectId= filter)',
  })
  @ApiPaginatedResponse(PortalQuoteEntity)
  @ApiNotFoundResponse({ description: 'projectId is not shared with you' })
  @ApiForbiddenResponse({
    description: 'Quotes are not enabled for this portal',
  })
  findAll(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Query() query: PortalQuotesQueryDto,
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
  @ApiOperation({ summary: 'Get a quote' })
  @ApiOkResponse({ type: PortalQuoteEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description: 'Quotes are not enabled for this portal',
  })
  findOne(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.clientPortalId, user.sub, id);
  }

  @Get(':id/download')
  @ApiOperation({
    summary:
      'Download the quote as a PDF (the document the quote mail attached)',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description: 'Quotes are not enabled for this portal',
  })
  async downloadPdf(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { filename, buffer } = await this.service.downloadPdf(
      user.clientPortalId,
      user.sub,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get(':id/attachments/:documentId/download')
  @ApiOperation({ summary: 'Download a file attached to the quote' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description: 'Quotes are not enabled for this portal',
  })
  async downloadAttachment(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { document, content } = await this.service.downloadAttachment(
      user.clientPortalId,
      user.sub,
      id,
      documentId,
    );
    res.set({
      'Content-Type': document.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.name)}"`,
    });
    return new StreamableFile(content);
  }

  @Post(':id/accept')
  @ApiOperation({
    summary:
      'Accept a sent quote, optionally choosing which options to include. The workspace is notified and starts the project.',
  })
  @ApiOkResponse({ type: PortalQuoteEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description: 'Quotes are not enabled for this portal',
  })
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
  @ApiForbiddenResponse({
    description: 'Quotes are not enabled for this portal',
  })
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
