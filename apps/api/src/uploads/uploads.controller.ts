import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StorageService, StoredFile } from '../storage/storage.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Upload a file (local disk in dev, S3 in prod)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<StoredFile> {
    if (!file) throw new BadRequestException('No file provided');
    const stored = await this.storage.upload(file);
    this.events.emit('file.uploaded', stored);
    return stored;
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Delete an uploaded file by storage key' })
  async remove(@Param('key') key: string): Promise<{ deleted: true }> {
    await this.storage.remove(key);
    this.events.emit('file.deleted', { key });
    return { deleted: true };
  }
}
