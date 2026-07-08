import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { requestBaseUrl } from '../common/http/request-base-url';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../identity/auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentEntity } from './entities/document.entity';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a file and register it as a document' })
  @ApiConsumes('multipart/form-data')
  @ApiExtraModels(CreateDocumentDto)
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(CreateDocumentDto) },
        {
          type: 'object',
          properties: { file: { type: 'string', format: 'binary' } },
          required: ['file'],
        },
      ],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiCreatedResponse({ type: DocumentEntity })
  @ApiNotFoundResponse({ description: 'Client or project not found' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.documentsService.create(user.sub, dto, file);
  }

  @Get()
  @ApiOperation({ summary: 'List documents (cursor paginated)' })
  @ApiPaginatedResponse(DocumentEntity)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListDocumentsQueryDto,
    @Req() req: Request,
  ) {
    return this.documentsService.findAll(user.sub, query, requestBaseUrl(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document' })
  @ApiOkResponse({ type: DocumentEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document metadata' })
  @ApiOkResponse({ type: DocumentEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document and its stored file' })
  @ApiOkResponse({ type: DocumentEntity })
  @ApiNotFoundResponse()
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.remove(user.sub, id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the stored file' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse()
  async downloadFile(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.file(user.sub, id, res, 'attachment');
  }

  @Get(':id/preview')
  @ApiOperation({
    summary: 'Preview the stored file inline (browser viewer for PDFs/images)',
  })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse()
  @Header('Cache-Control', 'private, max-age=60')
  async previewFile(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.file(user.sub, id, res, 'inline');
  }

  @Post(':id/share')
  @ApiOperation({
    summary: "Email the document to its client as an attachment",
  })
  @ApiOkResponse({ type: DocumentEntity })
  @ApiBadRequestResponse({ description: 'Document has no linked client' })
  @ApiNotFoundResponse()
  share(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.share(user.sub, id);
  }

  private async file(
    ownerId: string,
    id: string,
    res: Response,
    disposition: 'attachment' | 'inline',
  ): Promise<StreamableFile> {
    const { document, content } = await this.documentsService.download(
      ownerId,
      id,
    );
    res.set({
      'Content-Type': document.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(document.name)}"`,
    });
    return new StreamableFile(content);
  }
}
