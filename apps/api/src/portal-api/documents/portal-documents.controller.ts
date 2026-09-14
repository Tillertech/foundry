import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentPortalUser } from '../../portal-auth/decorators/current-portal-user.decorator';
import {
  PortalJwtAuthGuard,
  PortalJwtPayload,
} from '../../portal-auth/portal-jwt-auth.guard';
import { PortalDocumentEntity } from './entities/portal-document.entity';
import { PortalDocumentsService } from './portal-documents.service';

@ApiTags('portal-documents')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/documents')
export class PortalDocumentsController {
  constructor(private readonly service: PortalDocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents shared with the signed-in portal user' })
  @ApiPaginatedResponse(PortalDocumentEntity)
  @ApiForbiddenResponse({ description: 'Documents are not enabled for this portal' })
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
  @ApiOperation({ summary: 'Get a document' })
  @ApiOkResponse({ type: PortalDocumentEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Documents are not enabled for this portal' })
  findOne(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.clientPortalId, id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the document' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Documents are not enabled for this portal' })
  async download(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { document, content } = await this.service.download(
      user.clientPortalId,
      id,
    );
    res.set({
      'Content-Type': document.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.name)}"`,
    });
    return new StreamableFile(content);
  }
}
