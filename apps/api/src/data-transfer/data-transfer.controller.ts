import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard, type JwtPayload } from '../identity/auth/jwt-auth.guard';
import { AccountExportsService, type AccountExportStatus } from './account-exports.service';

const EXPORT_THROTTLE = { default: { limit: 5, ttl: 3_600_000 } };

/** Taking account data out (bundle.ts). */
@ApiTags('account')
@Controller('account')
export class DataTransferController {
  constructor(private readonly exports: AccountExportsService) {}

  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle(EXPORT_THROTTLE)
  @ApiOperation({
    summary: 'Export everything your account holds',
    description:
      'Builds your account, every workspace and all their records and files as one gzipped NDJSON bundle, in the background. You are notified (in the app and by email) when it is ready; then download it from GET /account/export/:id/download. The format is documented in bundle.ts. Asking again while one is running returns that one.',
  })
  @ApiAcceptedResponse({ description: 'The queued (or already running) export' })
  requestExport(@CurrentUser() user: JwtPayload): Promise<AccountExportStatus> {
    return this.exports.request(user.sub);
  }

  @Get('export/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Where an export is: queued, running, ready, failed or expired' })
  @ApiNotFoundResponse({ description: 'No such export of yours' })
  exportStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<AccountExportStatus> {
    return this.exports.status(user.sub, id);
  }

  @Get('export/:id/download')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Download a finished export' })
  @ApiProduces('application/gzip')
  @ApiNotFoundResponse({ description: 'Not ready, expired, or not yours' })
  async download(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, fileName } = await this.exports.download(user.sub, id);
    res.setHeader('content-type', 'application/gzip');
    res.setHeader('content-disposition', `attachment; filename="${fileName}"`);
    await pipeline(stream, res);
  }
}
