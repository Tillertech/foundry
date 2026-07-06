import { Injectable, Logger } from '@nestjs/common';
import { CursorService, CursorPosition } from './cursor.service';

export type PaginationOpts = {
  cursor?: string;
  take?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
  baseUrl?: string;
  includeCount?: boolean;
};

export type PaginationRes<T> = {
  count?: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

@Injectable()
export class PaginationService {
  private readonly logger = new Logger(PaginationService.name);

  constructor(private cursorService: CursorService) {}

  private invertOrder(orderBy: Record<string, 'asc' | 'desc'>) {
    return Object.fromEntries(
      Object.entries(orderBy).map(([k, v]) => [
        k,
        v === 'asc' ? 'desc' : 'asc',
      ]),
    ) as Record<string, 'asc' | 'desc'>;
  }

  /**
   * Build lexicographic WHERE that implements:
   * (f1 OP val1)
   * OR (f1 == val1 AND f2 OP val2)
   * OR (f1 == val1 AND f2 == val2 AND id OP idVal)
   *
   * `queryOrder` is the order direction used for the DB query.
   * Thought: implement
   */
  private buildCursorWhere(
    baseWhere: any,
    cursor: CursorPosition | null,
    queryOrder: Record<string, 'asc' | 'desc'>,
  ): any {
    if (!cursor) return baseWhere;

    const ordering = cursor.ordering || {};
    const fields = Object.keys(queryOrder);

    //* id is a tie-breaker for records created at same time?
    const allFields = fields.includes('id')
      ? fields.slice()
      : [...fields, 'id'];

    // default id direction if not present
    const idDirection =
      queryOrder['id'] ?? queryOrder[fields[fields.length - 1]] ?? 'desc';

    const orConditions: any[] = [];

    for (let i = 0; i < allFields.length; i++) {
      const currentField = allFields[i];
      // determine direction for current field. If not specified (id), use idDirection.
      const dir = queryOrder[currentField] ?? idDirection;
      const op = dir === 'desc' ? 'lt' : 'gt';

      const opCond = { [currentField]: { [op]: ordering[currentField] } };

      if (i === 0) {
        orConditions.push(opCond);
      } else {
        const equalsArr: any[] = [];
        for (let j = 0; j < i; j++) {
          const prev = allFields[j];
          equalsArr.push({ [prev]: ordering[prev] });
        }
        orConditions.push({ AND: [...equalsArr, opCond] });
      }
    }

    const where: any = { ...(baseWhere ?? {}) };

    // If baseWhere already has OR/AND  keep it and AND the cursor OR conditions
    if (where.AND) {
      where.AND = [...where.AND, { OR: orConditions }];
    } else {
      // combine baseWhere AND (OR conditions)
      where.AND = [where, { OR: orConditions }];
      // remove the duplicate top-level fields that got copied into the leftmost where
    }

    return where;
  }

  private buildUrl(baseUrl: string, params: Record<string, any>): string {
    if (!baseUrl) return '';
    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) urlParams.set(k, v.toString());
    });
    return `${baseUrl}?${urlParams.toString()}`;
  }

  async paginate<T>(
    prismaDelegate: any,
    baseArgs: any,
    options: PaginationOpts = {},
  ): Promise<PaginationRes<T>> {
    const {
      cursor,
      take = 10,
      orderBy,
      baseUrl = 'http://navengineapi.com',
      includeCount = false,
    } = options;

    let decodedCursor: CursorPosition | null = null;
    if (cursor) {
      decodedCursor = this.cursorService.decodeCursor(cursor);
    }

    const requestedDirection: 'forward' | 'backward' =
      decodedCursor?.direction === 'backward' ? 'backward' : 'forward';

    // add id as tie-breaker for recs created at same time
    const prismaOrder = [
      ...Object.entries(
        requestedDirection === 'backward' ? this.invertOrder(orderBy) : orderBy,
      ).map(([k, dir]) => ({ [k]: dir })),
      {
        id:
          requestedDirection === 'backward'
            ? orderBy['id'] === 'asc'
              ? 'desc'
              : 'asc'
            : (orderBy['id'] ?? 'desc'),
      },
    ];

    const prismaCursor = decodedCursor
      ? { id: decodedCursor.ordering.id }
      : undefined;

    // Fetch take+1 to detect next/previous
    const records = await prismaDelegate.findMany({
      ...baseArgs,
      ...(prismaCursor ? { cursor: prismaCursor, skip: 1 } : {}),
      take: take + 1,
      orderBy: prismaOrder,
    });

    const hasExtra = records.length > take;
    const pageSlice = hasExtra ? records.slice(0, take) : records.slice();

    // If going backward, reverse results to maintain original order
    const results =
      requestedDirection === 'backward' ? pageSlice.reverse() : pageSlice;

    // Build next/previous
    let next: string | null = null;
    let previous: string | null = null;

    if (results.length > 0) {
      const firstDisplayed = results[0];
      const lastDisplayed = results[results.length - 1];

      if (requestedDirection === 'forward') {
        if (hasExtra) {
          const nxt = this.cursorService.createCursorFromRecord(
            lastDisplayed,
            orderBy,
            'forward',
          );
          next = this.buildUrl(baseUrl, { cursor: nxt, take });
        }
        if (decodedCursor) {
          const prev = this.cursorService.createCursorFromRecord(
            firstDisplayed,
            orderBy,
            'backward',
          );
          previous = this.buildUrl(baseUrl, { cursor: prev, take });
        }
      } else {
        // backward
        if (hasExtra) {
          const prev = this.cursorService.createCursorFromRecord(
            firstDisplayed,
            orderBy,
            'backward',
          );
          previous = this.buildUrl(baseUrl, { cursor: prev, take });
        }
        if (decodedCursor) {
          const nxt = this.cursorService.createCursorFromRecord(
            lastDisplayed,
            orderBy,
            'forward',
          );
          next = this.buildUrl(baseUrl, { cursor: nxt, take });
        }
      }
    }

    let count: number | undefined = undefined;
    if (includeCount && typeof prismaDelegate.count === 'function') {
      count = await prismaDelegate.count({ where: baseArgs.where });
    }

    return {
      count,
      next,
      previous,
      results: results as T[],
    };
  }
}
