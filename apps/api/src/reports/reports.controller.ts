import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../identity/auth/jwt-auth.guard';
import { ReportSummaryQueryDto } from './dto/report-summary-query.dto';
import { ReportSummaryEntity } from './entities/report-summary.entity';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Business summary for a period (cached ~5 minutes)',
    description:
      'Revenue, cash flow, outstanding balances and breakdowns. Amounts are converted into the workspace currency; paymentsByCurrency also keeps the currency each customer paid with.',
  })
  @ApiOkResponse({ type: ReportSummaryEntity })
  summary(
    @CurrentUser() user: JwtPayload,
    @Query() query: ReportSummaryQueryDto,
  ) {
    return this.reportsService.summary(user.sub, query);
  }
}
