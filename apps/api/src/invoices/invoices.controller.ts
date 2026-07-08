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
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ExchangeRatesQueryDto } from './dto/exchange-rates-query.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { ExchangeRatesEntity } from './entities/exchange-rates.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an invoice with line items' })
  @ApiCreatedResponse({ type: InvoiceEntity })
  @ApiNotFoundResponse({ description: 'Client or project not found' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List invoices (cursor paginated)' })
  @ApiPaginatedResponse(InvoiceEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListInvoicesQueryDto,
    @Req() req: Request,
  ) {
    return this.invoicesService.findAll(user.sub, query, requestBaseUrl(req));
  }

  @Get('exchange-rates')
  @ApiOperation({
    summary: 'Conversion rates into the workspace currency',
    description:
      'Rates from every supported currency into the default workspace currency (or ?target=), for normalizing mixed-currency amounts.',
  })
  @ApiOkResponse({ type: ExchangeRatesEntity })
  exchangeRates(
    @CurrentUser() user: JwtPayload,
    @Query() query: ExchangeRatesQueryDto,
  ) {
    return this.invoicesService.exchangeRates(user.sub, query.target);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an invoice' })
  @ApiOkResponse({ type: InvoiceEntity })
  @ApiNotFoundResponse()
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an invoice (items replace existing ones)' })
  @ApiOkResponse({ type: InvoiceEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an invoice' })
  @ApiOkResponse({ type: InvoiceEntity })
  @ApiNotFoundResponse()
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.remove(user.sub, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Mark the invoice sent and email it to the client' })
  @ApiOkResponse({ type: InvoiceEntity })
  @ApiNotFoundResponse()
  send(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.send(user.sub, id);
  }

  @Get(':id/timeline')
  @ApiOperation({
    summary: 'Reconciliation timeline for the invoice (cursor paginated)',
    description:
      'Every payment applied, adjusted or reversed against this invoice, with the balances after each entry. Pass includeProject=true to also include entries from the rest of the linked project.',
  })
  @ApiPaginatedResponse(ReconciliationEntryEntity)
  @ApiNotFoundResponse()
  async timeline(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTimelineQueryDto,
    @Req() req: Request,
  ) {
    const invoice = await this.invoicesService.findOne(user.sub, id);
    return this.reconciliation.timeline(
      user.sub,
      {
        invoiceId: id,
        ...(query.includeProject && invoice.projectId
          ? { projectId: invoice.projectId }
          : {}),
      },
      query,
      requestBaseUrl(req),
    );
  }
}
