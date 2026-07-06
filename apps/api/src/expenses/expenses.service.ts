import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import type { ExpenseModel as Expense } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

/**
 * Expenses without a project have no ownership chain in the schema, so they
 * are visible workspace-wide; project-linked ones are scoped to the owner.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly projects: ProjectsService,
  ) {}

  private scope(ownerId: string) {
    return {
      OR: [
        { projectId: null },
        { project: { client: { workspace: { ownerId } } } },
      ],
    };
  }

  async create(ownerId: string, dto: CreateExpenseDto): Promise<Expense> {
    if (dto.projectId) await this.projects.findOne(ownerId, dto.projectId);
    return this.prisma.expense.create({ data: dto });
  }

  findAll(
    ownerId: string,
    query: ListExpensesQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Expense>> {
    const { cursor, take, projectId, category, billable } = query;
    return this.pagination.paginate<Expense>(
      this.prisma.expense,
      {
        where: {
          AND: [
            this.scope(ownerId),
            {
              ...(projectId ? { projectId } : {}),
              ...(category ? { category } : {}),
              ...(billable !== undefined ? { billable } : {}),
            },
          ],
        },
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
      where: { AND: [{ id }, this.scope(ownerId)] },
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
    if (dto.projectId) await this.projects.findOne(ownerId, dto.projectId);
    return this.prisma.expense.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, id: string): Promise<Expense> {
    await this.findOne(ownerId, id);
    return this.prisma.expense.delete({ where: { id } });
  }
}
