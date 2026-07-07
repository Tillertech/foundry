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
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseEntity } from './entities/expense.entity';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Record an expense, optionally linked to a project' })
  @ApiCreatedResponse({ type: ExpenseEntity })
  @ApiNotFoundResponse({ description: 'Project not found' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List expenses (cursor paginated)' })
  @ApiPaginatedResponse(ExpenseEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListExpensesQueryDto,
    @Req() req: Request,
  ) {
    return this.expensesService.findAll(user.sub, query, requestBaseUrl(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an expense' })
  @ApiOkResponse({ type: ExpenseEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an expense' })
  @ApiOkResponse({ type: ExpenseEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an expense' })
  @ApiOkResponse({ type: ExpenseEntity })
  @ApiNotFoundResponse()
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.remove(user.sub, id);
  }
}
