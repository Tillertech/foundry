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
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QuoteEntity } from './entities/quote.entity';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a quote with line items' })
  @ApiCreatedResponse({ type: QuoteEntity })
  @ApiNotFoundResponse({ description: 'Client not found' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List quotes (cursor paginated)' })
  @ApiPaginatedResponse(QuoteEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListQuotesQueryDto,
    @Req() req: Request,
  ) {
    return this.quotesService.findAll(user.sub, query, requestBaseUrl(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a quote' })
  @ApiOkResponse({ type: QuoteEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a quote (items replace existing ones)' })
  @ApiOkResponse({ type: QuoteEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.quotesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a quote' })
  @ApiOkResponse({ type: QuoteEntity })
  @ApiNotFoundResponse()
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.remove(user.sub, id);
  }
}
