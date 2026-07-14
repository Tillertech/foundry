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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../identity/auth/jwt-auth.guard';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceEntity } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a workspace' })
  @ApiCreatedResponse({ type: WorkspaceEntity })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my workspaces (oldest first; first is default)' })
  @ApiOkResponse({ type: [WorkspaceEntity] })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.workspacesService.findAll(user.sub);
  }

  @Get('default')
  @ApiOperation({ summary: 'Get my default workspace' })
  @ApiOkResponse({ type: WorkspaceEntity })
  @ApiNotFoundResponse()
  findDefault(@CurrentUser() user: JwtPayload) {
    return this.workspacesService.findDefault(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workspace' })
  @ApiOkResponse({ type: WorkspaceEntity })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.workspacesService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a workspace' })
  @ApiOkResponse({ type: WorkspaceEntity })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a workspace (cascades to its clients)' })
  @ApiOkResponse({ type: WorkspaceEntity })
  @ApiNotFoundResponse()
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.workspacesService.remove(user.sub, id);
  }

  @Post(':id/logo')
  @ApiOperation({
    summary: 'Upload the workspace logo (printed on invoice and quote PDFs)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  @ApiCreatedResponse({ type: WorkspaceEntity })
  @ApiBadRequestResponse({ description: 'Missing file or unsupported image type' })
  @ApiNotFoundResponse()
  uploadLogo(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.workspacesService.uploadLogo(user.sub, id, file);
  }

  @Get(':id/logo')
  @ApiOperation({ summary: 'The workspace logo image' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Workspace not found or has no logo' })
  @Header('Cache-Control', 'private, max-age=60')
  async logo(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { content, mimeType } = await this.workspacesService.readLogo(
      user.sub,
      id,
    );
    res.set({ 'Content-Type': mimeType });
    return new StreamableFile(content);
  }

  @Delete(':id/logo')
  @ApiOperation({ summary: 'Remove the workspace logo' })
  @ApiOkResponse({ type: WorkspaceEntity })
  @ApiNotFoundResponse()
  removeLogo(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workspacesService.removeLogo(user.sub, id);
  }
}
