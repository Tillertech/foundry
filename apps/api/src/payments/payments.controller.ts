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
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentEntity } from './entities/payment.entity';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Record a payment, optionally marking its invoice paid' })
  @ApiCreatedResponse({ type: PaymentEntity })
  @ApiNotFoundResponse({ description: 'Client or invoice not found' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List payments (cursor paginated)' })
  @ApiPaginatedResponse(PaymentEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListPaymentsQueryDto,
    @Req() req: Request,
  ) {
    return this.paymentsService.findAll(user.sub, query, requestBaseUrl(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payment' })
  @ApiOkResponse({ type: PaymentEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a payment' })
  @ApiOkResponse({ type: PaymentEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.paymentsService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a payment' })
  @ApiOkResponse({ type: PaymentEntity })
  @ApiNotFoundResponse()
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.remove(user.sub, id);
  }
}
