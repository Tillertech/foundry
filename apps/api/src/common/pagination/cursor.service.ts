import { Injectable } from '@nestjs/common';

export type CursorPosition = {
  ordering: Record<string, any>;
  direction: 'forward' | 'backward';
};

@Injectable()
export class CursorService {
  encodeCursor(cursor: CursorPosition): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  decodeCursor(encoded: string): CursorPosition {
    try {
      return JSON.parse(Buffer.from(encoded, 'base64').toString());
    } catch (err) {
      throw new Error('Invalid cursor');
    }
  }

  /**
   * Create a cursor from a returned DB record.
   * `orderBy` is the *original* order the API exposes (not inverted).
   * direction indicates how the server should interpret this cursor when received.
   */
  createCursorFromRecord(
    record: any,
    orderBy: Record<string, 'asc' | 'desc'>,
    direction: 'forward' | 'backward' = 'forward',
  ): string {
    const ordering: Record<string, any> = {};

    // capture each order field value from the record
    for (const field of Object.keys(orderBy)) {
      ordering[field] = record[field];
    }

    // always include id as a tie-breaker (if present)
    if (record && typeof record.id !== 'undefined') {
      ordering.id = record.id;
    }

    return this.encodeCursor({ ordering, direction });
  }
}
