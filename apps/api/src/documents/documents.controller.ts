import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request } from 'express';
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
}
