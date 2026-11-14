import { PostgrestError } from '@supabase/supabase-js';

/** Supabase .in() URL 길이 및 파라미터 제한을 피하기 위한 공용 청크 크기 */
export const IN_QUERY_CHUNK_SIZE = 200;

export interface FetchAllOptions {
  pageSize?: number;
  maxRows?: number;
}

export interface FetchAllResult<T> {
  data: T[] | null;
  error: PostgrestError | Error | null;
  truncated?: boolean;
}

/**
 * Supabase 기본 1,000행 제한을 극복하기 위한 페이지네이션 조회 헬퍼.
 * .range(from, from + pageSize - 1)를 반복 호출하여 조건에 맞는 전체 행을 조회합니다.
 *
 * @param queryOrFactory Supabase 쿼리 객체 또는 쿼리를 반환하는 팩토리 함수
 *                       (안정적인 페이징을 위해 반드시 order('date' 등, { ascending }).order('id') 적용 권장)
 * @param options pageSize (기본 1000), maxRows (기본 20000 상한 안전장치)
 */
export async function fetchAll<T = any>(
  queryOrFactory: any,
  options?: FetchAllOptions
): Promise<FetchAllResult<T>> {
  const pageSize = options?.pageSize ?? 1000;
  const maxRows = options?.maxRows ?? 20000;

  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const query = typeof queryOrFactory === 'function' ? queryOrFactory() : queryOrFactory;
    const { data, error } = await query.range(from, to);

    if (error) {
      console.error(`[fetchAll] Error fetching range ${from}-${to}:`, error);
      return { data: null, error };
    }

    const rows = (data ?? []) as T[];
    allRows.push(...rows);

    if (allRows.length >= maxRows) {
      console.error(
        `[fetchAll] Safety cap reached: fetched ${allRows.length} rows (limit: ${maxRows}). Halting pagination and returning error.`
      );
      return {
        data: null,
        error: new Error('조회 상한 초과'),
        truncated: true,
      };
    }

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return { data: allRows, error: null };
}
