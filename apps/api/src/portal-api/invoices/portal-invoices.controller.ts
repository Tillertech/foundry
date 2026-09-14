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
import { PortalInvoiceEntity } from './entities/portal-invoice.entity';
import { PortalInvoicesService } from './portal-invoices.service';

@ApiTags('portal-invoices')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/invoices')
export class PortalInvoicesController {
  constructor(private readonly service: PortalInvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices (cursor paginated)' })
  @ApiPaginatedResponse(PortalInvoiceEntity)
  @ApiForbiddenResponse({ description: 'Invoices are not enabled for this portal' })
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
  @ApiOperation({ summary: 'Get an invoice' })
  @ApiOkResponse({ type: PortalInvoiceEntity })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Invoices are not enabled for this portal' })
  findOne(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.clientPortalId, id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the invoice as a PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Invoices are not enabled for this portal' })
  async download(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { filename, buffer } = await this.service.downloadPdf(
      user.clientPortalId,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    });
    return new StreamableFile(buffer);
  }
}
