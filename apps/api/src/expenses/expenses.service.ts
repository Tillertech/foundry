import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import type { ExpenseModel } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

export type Expense = ExpenseModel & {
  invoiceItem: { invoice: { id: string; number: string } } | null;
};

/** Which invoice (if any) billed the expense, on every read/write. */
const EXPENSE_INCLUDE = {
  invoiceItem: { select: { invoice: { select: { id: true, number: true } } } },
} as const;

/**
 * Every expense belongs to exactly one workspace (its own `workspaceId`,
 * kept in step with its project's), and every query is scoped through that
 * workspace's owner - so an expense is never visible across tenants,
 * whether or not it's linked to a project. Legacy rows with no workspace
 * match no one.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly projects: ProjectsService,
    private readonly workspaces: WorkspacesService,
  ) {}

  private scope(ownerId: string) {
    return { workspace: { ownerId } };
  }

  async create(ownerId: string, dto: CreateExpenseDto): Promise<Expense> {
    const { workspaceId: requested, ...data } = dto;
    const workspaceId = await this.resolveWorkspace(
      ownerId,
      dto.projectId,
      requested,
    );
    return this.prisma.expense.create({
      data: { ...data, workspaceId },
      include: EXPENSE_INCLUDE,
    });
  }

  findAll(
    ownerId: string,
    query: ListExpensesQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Expense>> {
    const {
      cursor,
      take,
      projectId,
      clientId,
      workspaceId,
      category,
      billable,
    } = query;
    return this.pagination.paginate<Expense>(
      this.prisma.expense,
      {
        where: {
          workspace: { ownerId, ...(workspaceId ? { id: workspaceId } : {}) },
          ...(projectId ? { projectId } : {}),
          ...(clientId ? { project: { clientId } } : {}),
          ...(category ? { category } : {}),
          ...(billable !== undefined ? { billable } : {}),
        },
        include: EXPENSE_INCLUDE,
      },
      {
        cursor,
        take,
        orderBy: { date: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(ownerId: string, id: string): Promise<Expense> {
    const expense = await this.prisma.expense.findFirst({
      where: { id, ...this.scope(ownerId) },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateExpenseDto,
  ): Promise<Expense> {
    await this.findOne(ownerId, id);
    // Moving onto a project moves the expense into that project's
    // workspace too; unlinking the project leaves it where it is.
    const workspaceId = dto.projectId
      ? await this.projectWorkspaceId(ownerId, dto.projectId)
      : undefined;
    return this.prisma.expense.update({
      where: { id },
      data: { ...dto, ...(workspaceId ? { workspaceId } : {}) },
      include: EXPENSE_INCLUDE,
    });
  }

  async remove(ownerId: string, id: string): Promise<Expense> {
    await this.findOne(ownerId, id);
    return this.prisma.expense.delete({
      where: { id },
      include: EXPENSE_INCLUDE,
    });
  }

  /**
   * The workspace a new expense lands in: its project's when it has one
   * (an explicitly requested workspace must agree), else the requested
   * workspace, else the caller's default - each checked to be the caller's.
   */
  private async resolveWorkspace(
    ownerId: string,
    projectId: string | undefined,
    requested: string | undefined,
  ): Promise<string> {
    if (projectId) {
      const workspaceId = await this.projectWorkspaceId(ownerId, projectId);
      if (requested && requested !== workspaceId) {
        throw new BadRequestException(
          'The project belongs to a different workspace than the one requested',
        );
      }
      return workspaceId;
    }
    const workspace = requested
      ? await this.workspaces.findOne(ownerId, requested)
      : await this.workspaces.findDefault(ownerId);
    return workspace.id;
  }

  /** The workspace of one of the caller's projects (404 if not theirs). */
  private async projectWorkspaceId(
    ownerId: string,
    projectId: string,
  ): Promise<string> {
    const project = await this.projects.findOne(ownerId, projectId);
    const client = await this.prisma.client.findUnique({
      where: { id: project.clientId },
      select: { workspaceId: true },
    });
    if (!client) throw new NotFoundException('Project not found');
    return client.workspaceId;
  }
}
