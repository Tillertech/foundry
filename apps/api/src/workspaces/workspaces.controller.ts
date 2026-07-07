import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
}
