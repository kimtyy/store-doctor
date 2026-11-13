import crypto from 'crypto';
import { normalizeMenuDisplayName, normalizeMenuCanonicalKey } from '@/lib/menus';
export {
  detectYearMonthFromFileName,
  getNextYearMonth,
  getSeoulTodayStr,
  getSeoulStartOfDayUtc,
} from './okposDate';
import { getSeoulTodayStr } from './okposDate';

export interface OkposDaySale {
  day: number; // 1 ~ 31
  date: string; // 'YYYY-MM-DD'
  quantity: number;
  amount: number; // 부가세 포함 금액
}

export interface OkposParsedMenuRow {
  rawName: string;
  canonicalName: string;
  canonicalKey: string;
  totalQuantity: number;
  totalAmount: number; // 부가세 포함 금액
  dailySales: OkposDaySale[]; // 수량>0 또는 금액>0 인 날만 필터 가능하지만 파싱 시 전체 보관
}

export interface OkposDaySummary {
  day: number;
  date: string;
  menuItemCount: number; // 해당 일에 수량>0 또는 금액>0 인 메뉴 개수
  totalAmount: number; // 부가세 포함 합계
  netRevenue: number; // round(totalAmount ÷ 1.1)
  tax: number; // totalAmount - netRevenue
  isZeroRevenue: boolean;
  isFutureDate: boolean; // 오늘(Asia/Seoul) 이후 날짜여서 무시 대상인지
}

export interface OkposParseResult {
  ok: boolean;
  error?: string;
  yearMonth?: string; // 'YYYY-MM'
  daysInMonth?: number;
  expectedColumns?: number; // 3 + 2 * daysInMonth
  actualColumns?: number;
  fileSha256?: string;
  menuRows?: OkposParsedMenuRow[];
  daySummaries?: OkposDaySummary[];
  grandTotalAmount?: number; // 부가세 포함 총합 (미래일 제외 유효분)
  grandNetRevenue?: number; // 순매출 총합
  grandTax?: number; // 부가세 총합
  openDaysCount?: number; // 순매출 > 0 인 유효 영업일수
  zeroRevenueDays?: string[]; // 'YYYY-MM-DD' 목록
}

/**
 * EUC-KR / UTF-8 인코딩 안전 디코더
 */
export function decodeOkposHtmlBuffer(buffer: Uint8Array | ArrayBuffer): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(bytes);
  } catch {
    const euckrDecoder = new TextDecoder('euc-kr');
    return euckrDecoder.decode(bytes);
  }
}

/**
 * SHA-256 계산
 */
export function calcSha256(buffer: Uint8Array | ArrayBuffer | string): string {
  const hash = crypto.createHash('sha256');
  if (typeof buffer === 'string') {
    hash.update(buffer, 'utf8');
  } else if (buffer instanceof Uint8Array) {
    hash.update(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  } else {
    hash.update(Buffer.from(buffer));
  }
  return hash.digest('hex');
}

/**
 * 숫자 문자열 파싱 ("1,855,000", " - ", "" 등)
 */
function parseNum(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '—') return 0;
  const num = Number(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

/**
 * HTML 테이블 파싱 (정규식 기반 순경량 파서, 외부 의존성 없음)
 */
interface ExtractedRow {
  cells: string[];
  isSummary: boolean;
}

function extractTableCells(html: string): ExtractedRow[] {
  const rows: ExtractedRow[] = [];
  const trRegex = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;

  const hasSummaryClass = (attrStr: string): boolean => {
    const classMatch = attrStr.match(/\bclass\s*=\s*["']?([^"'>]+)["']?/i);
    if (!classMatch) return false;
    const tokens = classMatch[1].trim().split(/\s+/);
    return tokens.some((token) => /summary$/i.test(token));
  };

  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const trAttrs = trMatch[1];
    const trContent = trMatch[2];
    const cells: string[] = [];
    let isSummary = hasSummaryClass(trAttrs);
    let tdMatch: RegExpExecArray | null;
    tdRegex.lastIndex = 0;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      const tdAttrs = tdMatch[1];
      if (hasSummaryClass(tdAttrs)) {
        isSummary = true;
      }
      // 태그 및 엔티티 제거
      let cellText = tdMatch[2].replace(/<[^>]+>/g, '').trim();
      // HTML 엔티티 치환 (&nbsp; -> U+00A0, &amp; -> & 등)
      cellText = cellText
        .replace(/&nbsp;/gi, '\u00A0')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
      cells.push(cellText);
    }
    if (cells.length > 0) {
      rows.push({ cells, isSummary });
    }
  }
  return rows;
}

/**
 * OKPOS 메뉴별×일자 보고서 파싱 및 유효성 검증
 *
 * @param buffer 파일 바이트 (Uint8Array / ArrayBuffer)
 * @param yearMonth 사용자가 지정한 연·월 ('YYYY-MM')
 */
export function parseOkposMenuDaily(
  buffer: Uint8Array | ArrayBuffer,
  yearMonth: string
): OkposParseResult {
  const ymMatch = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!ymMatch) {
    return { ok: false, error: '연·월 형식이 올바르지 않습니다. (예: 2026-09)' };
  }
  const year = parseInt(ymMatch[1], 10);
  const month = parseInt(ymMatch[2], 10);
  if (month < 1 || month > 12) {
    return { ok: false, error: '월은 1월부터 12월 사이여야 합니다.' };
  }

  const todayStr = getSeoulTodayStr();
  const currentYm = todayStr.slice(0, 7);
  if (yearMonth > currentYm) {
    return { ok: false, error: '미래의 연·월은 가져올 수 없습니다.' };
  }

  const fileSha256 = calcSha256(buffer);
  const html = decodeOkposHtmlBuffer(buffer);
  const allRows = extractTableCells(html);

  if (allRows.length === 0) {
    return { ok: false, error: 'HTML 표 형식이 아니거나 데이터 행이 없습니다.' };
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const expectedCols = 3 + 2 * daysInMonth;

  // 행별 열 수 확인
  // 첫 번째 행의 열 수가 expectedCols와 맞아야 함
  const actualCols = allRows[0].cells.length;
  if (actualCols !== expectedCols) {
    const fileDays = Math.floor((actualCols - 3) / 2);
    return {
      ok: false,
      yearMonth,
      daysInMonth,
      expectedColumns: expectedCols,
      actualColumns: actualCols,
      error: `이 파일은 ${fileDays}일치인데 ${daysInMonth}일 달(${yearMonth.replace('-', '년 ')}월)로 지정됐어요. 파일 순서를 확인해 주세요.`,
    };
  }

  // 마지막 행(합계 행) 검사 (C-1: td class에 '…summary' 필수)
  const lastRowData = allRows[allRows.length - 1];
  if (!lastRowData.isSummary) {
    return {
      ok: false,
      yearMonth,
      error: 'OKPOS 보고서 형식이 아니에요.',
    };
  }

  const summaryRow = lastRowData.cells;
  const dataRows = allRows.slice(0, allRows.length - 1).map((r) => r.cells);

  // 메뉴 행 파싱 및 검증
  const menuRows: OkposParsedMenuRow[] = [];
  const dailyColSumQty = new Array(daysInMonth + 1).fill(0);
  const dailyColSumAmt = new Array(daysInMonth + 1).fill(0);

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const row = dataRows[rIdx];
    if (row.length !== expectedCols) {
      return {
        ok: false,
        error: `${rIdx + 1}번째 행의 열 수가 일치하지 않습니다. (예상 ${expectedCols}열, 실제 ${row.length}열)`,
      };
    }

    const rawName = row[0].trim();
    if (!rawName) continue; // 빈 이름 행 제외

    const totalQty = parseNum(row[1]);
    const totalAmt = parseNum(row[2]);

    let sumQty = 0;
    let sumAmt = 0;
    const dailySales: OkposDaySale[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const qIdx = 3 + (day - 1) * 2;
      const aIdx = qIdx + 1;
      const q = parseNum(row[qIdx]);
      const a = parseNum(row[aIdx]);

      sumQty += q;
      sumAmt += a;
      dailyColSumQty[day] += q;
      dailyColSumAmt[day] += a;

      const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
      dailySales.push({
        day,
        date: dateStr,
        quantity: q,
        amount: a,
      });
    }

    // 메뉴 행 검산: 합계 수량·금액 = 일자별 합
    if (totalQty !== sumQty || totalAmt !== sumAmt) {
      return {
        ok: false,
        error: '파일 안의 합계가 맞지 않아요. OKPOS에서 다시 받아 주세요.',
      };
    }

    menuRows.push({
      rawName,
      canonicalName: normalizeMenuDisplayName(rawName),
      canonicalKey: normalizeMenuCanonicalKey(rawName),
      totalQuantity: totalQty,
      totalAmount: totalAmt,
      dailySales,
    });
  }

  // 일자별 메뉴 합 = 합계 행 값 검증 (합계 행이 있는 경우)
  if (summaryRow) {
    for (let day = 1; day <= daysInMonth; day++) {
      const qIdx = 3 + (day - 1) * 2;
      const aIdx = qIdx + 1;
      const expectedDayQty = parseNum(summaryRow[qIdx]);
      const expectedDayAmt = parseNum(summaryRow[aIdx]);

      if (dailyColSumQty[day] !== expectedDayQty || dailyColSumAmt[day] !== expectedDayAmt) {
        return {
          ok: false,
          error: '파일 안의 합계가 맞지 않아요. OKPOS에서 다시 받아 주세요.',
        };
      }
    }
  }

  // 일자별 요약 집계 (진행 중인 달은 오늘 포함 이후 날짜는 마감 전이므로 무시)
  const isCurrentMonth = yearMonth === currentYm;
  const daySummaries: OkposDaySummary[] = [];
  const zeroRevenueDays: string[] = [];
  let grandTotalAmount = 0;
  let grandNetRevenue = 0;
  let grandTax = 0;
  let openDaysCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
    const isFutureDate = isCurrentMonth && dateStr >= todayStr;
    const dayAmt = dailyColSumAmt[day];

    let menuItemCount = 0;
    for (const m of menuRows) {
      const ds = m.dailySales[day - 1];
      if (ds && (ds.quantity > 0 || ds.amount > 0)) {
        menuItemCount++;
      }
    }

    const netRevenue = Math.round(dayAmt / 1.1);
    const tax = dayAmt - netRevenue;
    const isZeroRevenue = dayAmt === 0;

    if (!isFutureDate) {
      grandTotalAmount += dayAmt;
      grandNetRevenue += netRevenue;
      grandTax += tax;
      if (dayAmt > 0) {
        openDaysCount++;
      } else {
        zeroRevenueDays.push(dateStr);
      }
    }

    daySummaries.push({
      day,
      date: dateStr,
      menuItemCount,
      totalAmount: dayAmt,
      netRevenue,
      tax,
      isZeroRevenue,
      isFutureDate,
    });
  }

  return {
    ok: true,
    yearMonth,
    daysInMonth,
    expectedColumns: expectedCols,
    actualColumns: actualCols,
    fileSha256,
    menuRows,
    daySummaries,
    grandTotalAmount,
    grandNetRevenue,
    grandTax,
    openDaysCount,
    zeroRevenueDays,
  };
}
