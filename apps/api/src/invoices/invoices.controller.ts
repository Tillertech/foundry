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
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

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

  @Get(':id')
  @ApiOperation({ summary: 'Get an invoice' })
  @ApiOkResponse({ type: InvoiceEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
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
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.remove(user.sub, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Mark the invoice sent and email it to the client' })
  @ApiOkResponse({ type: InvoiceEntity })
  @ApiNotFoundResponse()
  send(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.send(user.sub, id);
  }
}
