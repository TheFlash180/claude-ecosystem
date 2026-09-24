import { describe, expect, it } from 'vitest';
import { fetchAllPages } from '../paging';

/** A fake table behind a server that caps every response at `cap` rows,
 *  whatever range was asked for — which is what PostgREST does. */
function server(total: number, cap = 1000) {
  const table = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: table.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { page, calls };
}

describe('fetchAllPages', () => {
  it('reads past the server cap', async () => {
    const { page } = server(2677);
    const { data, error } = await fetchAllPages(page);
    expect(error).toBeNull();
    expect(data).toHaveLength(2677);
    expect(data?.[2676]).toBe(2676);
  });

  it('stops on the first short page', async () => {
    const { page, calls } = server(1500);
    await fetchAllPages(page);
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('asks once more when the table is an exact multiple of the page', async () => {
    const { page, calls } = server(2000);
    const { data } = await fetchAllPages(page);
    expect(data).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it('handles an empty table', async () => {
    const { page } = server(0);
    expect((await fetchAllPages(page)).data).toEqual([]);
  });

  it('returns the error, never the rows read before it', async () => {
    let n = 0;
    const page = async () => {
      n++;
      return n === 2
        ? { data: null, error: { message: 'timeout' } }
        : { data: Array(1000).fill(0), error: null };
    };
    const { data, error } = await fetchAllPages(page);
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'timeout' });
  });

  it('stops at maxRows', async () => {
    const { page, calls } = server(10000);
    const { data } = await fetchAllPages(page, 3000);
    expect(data).toHaveLength(3000);
    expect(calls).toHaveLength(3);
  });
});
