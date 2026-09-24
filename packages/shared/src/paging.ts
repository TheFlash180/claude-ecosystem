// Reading a whole table past PostgREST's row cap.
//
// This project's API returns at most 1000 rows per request, whatever the
// client asks for: `.limit(2000)` or `.range(0, 49999)` comes back as a 206
// with the first 1000 and no error. That is how Front Row came to show events
// only up to the next month, with every undated listing — sorted last — gone.
//
// Pass a function that runs the query for one inclusive row range; this keeps
// asking until a page comes back short. The query must have a total order
// (add a unique column as the final `.order`), or rows that tie on the sort key
// can shift between requests and be skipped or repeated at a page boundary.

/** The server's cap. A smaller page still works; a larger one would be cut to
 *  this and read as the last page, which is the bug this file exists for. */
export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

/** Every row, or the first error. A partial list is never returned as if it
 *  were complete — callers treat an error the way they treated a failed
 *  single query before. `maxRows` bounds a runaway loop. */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows = 50000,
  pageSize = PAGE_SIZE,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const got = data ?? [];
    rows.push(...got);
    if (got.length < pageSize) break;
  }
  return { data: rows, error: null };
}
