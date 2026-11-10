import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

interface WithId {
  id: string;
}

/**
 * Replaces the item with the same id in place, or inserts it - keeping the
 * list's order via `compare` when given (inserted items land by that order;
 * replaced ones stay where they are unless `compare` moves them).
 */
export function upsertById<T extends WithId>(
  list: readonly T[],
  item: T,
  compare?: (a: T, b: T) => number,
): T[] {
  const exists = list.some((x) => x.id === item.id);
  const next = exists
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];
  return compare ? next.slice().sort(compare) : next;
}

export function removeById<T extends WithId>(
  list: readonly T[],
  id: string,
): T[] {
  return list.filter((x) => x.id !== id);
}

/** 404 / 403: the item is gone or no longer visible to this portal user. */
export function isGone(err: unknown): boolean {
  return (
    err instanceof HttpErrorResponse &&
    (err.status === 404 || err.status === 403)
  );
}

/**
 * Live-update one item of a list: refetch just that item and swap it in, or
 * drop it when it was removed or is no longer readable. `onError` runs for
 * anything else (e.g. network) - callers usually leave the list as it is.
 */
export function refreshOne<T extends WithId>(
  id: string,
  removed: boolean,
  fetch: (id: string) => Observable<T>,
  apply: (update: (list: readonly T[]) => T[]) => void,
  compare?: (a: T, b: T) => number,
): void {
  if (removed) {
    apply((list) => removeById(list, id));
    return;
  }
  fetch(id).subscribe({
    next: (item) => apply((list) => upsertById(list, item, compare)),
    error: (err) => {
      if (isGone(err)) apply((list) => removeById(list, id));
    },
  });
}
