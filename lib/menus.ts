/**
 * 메뉴 분류·정규화·자동 제안 단일 정의 모듈 (1-L)
 */

export const MENU_RAW_CATEGORIES = ['주류', '안주', '식사', '세트', '음료'] as const;
export type MenuRawCategory = (typeof MENU_RAW_CATEGORIES)[number];

/**
 * 메뉴 외 매출 항목 (매출 합계·기타 대분류에는 포함하되, 메뉴 순위·미분류·유사 제안에서는 제외)
 */
export const NON_MENU_ITEMS: readonly string[] = ['배달비', '배달팁', '배달료', '배달대행료'];

export type MajorMenuGroupKey = 'liquor' | 'food' | 'other';

export interface MajorMenuGroupMeta {
  key: MajorMenuGroupKey;
  label: string;
  shortLabel: string;
  rawCategories: readonly string[];
}

/**
 * 1-L 보고서용 대분류 3그룹 매핑 상수
 * - 주류 -> 주류
 * - 안주·식사·세트 -> 안주·식사
 * - 음료 및 미분류 -> 기타(음료·빙수 등)
 */
export const MENU_MAJOR_GROUPS: readonly MajorMenuGroupMeta[] = [
  {
    key: 'liquor',
    label: '주류',
    shortLabel: '주류',
    rawCategories: ['주류'],
  },
  {
    key: 'food',
    label: '안주·식사',
    shortLabel: '안주·식사',
    rawCategories: ['안주', '식사', '세트'],
  },
  {
    key: 'other',
    label: '기타(음료·빙수 등)',
    shortLabel: '기타',
    rawCategories: ['음료', '기타'],
  },
] as const;

export type LiquorSubCategoryKey =
  | 'soju'
  | 'draft_beer'
  | 'bottle_beer'
  | 'craft_beer'
  | 'makgeolli'
  | 'other_liquor';

export interface LiquorSubCategoryMeta {
  key: LiquorSubCategoryKey;
  label: string;
}

export const LIQUOR_SUB_CATEGORIES: readonly LiquorSubCategoryMeta[] = [
  { key: 'soju', label: '소주' },
  { key: 'draft_beer', label: '생맥주' },
  { key: 'bottle_beer', label: '병맥주' },
  { key: 'craft_beer', label: '수제맥주' },
  { key: 'makgeolli', label: '막걸리·전통주' },
  { key: 'other_liquor', label: '기타 주류' },
] as const;

export const LIQUOR_SUB_CATEGORY_LABELS: Record<LiquorSubCategoryKey, string> = {
  soju: '소주',
  draft_beer: '생맥주',
  bottle_beer: '병맥주',
  craft_beer: '수제맥주',
  makgeolli: '막걸리·전통주',
  other_liquor: '기타 주류',
};

const VALID_RAW_CATEGORY_SET = new Set<string>(MENU_RAW_CATEGORIES);
const VALID_LIQUOR_SUB_SET = new Set<string>(LIQUOR_SUB_CATEGORIES.map((s) => s.key));

export function isValidMenuRawCategory(value: unknown): value is MenuRawCategory {
  return typeof value === 'string' && VALID_RAW_CATEGORY_SET.has(value);
}

export function isValidLiquorSubCategory(value: unknown): value is LiquorSubCategoryKey {
  return typeof value === 'string' && VALID_LIQUOR_SUB_SET.has(value);
}

export function mapRawCategoryToMajorGroup(rawCategory?: string | null): MajorMenuGroupKey {
  if (!rawCategory) return 'other';
  const trimmed = rawCategory.trim();
  if (trimmed === '주류') return 'liquor';
  if (trimmed === '안주' || trimmed === '식사' || trimmed === '세트') return 'food';
  return 'other';
}

export function getMajorGroupLabel(key: MajorMenuGroupKey): string {
  return MENU_MAJOR_GROUPS.find((g) => g.key === key)?.label ?? '기타(음료·빙수 등)';
}

/**
 * 메뉴명 비교·집계·매칭용 Canonical Key
 * - NFKC 유니코드 정규화
 * - 모든 공백 문자(일반 공백, NBSP \u00A0, 전각 \u3000, zero-width \u200B-\u200D\uFEFF\u2060 등) 제거
 * - 영문 소문자 통일
 */
export function normalizeMenuCanonicalKey(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\s\u00A0\u1680\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF]/g, '')
    .toLowerCase();
}

export function normalizeMenuDisplayName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/[\s\u00A0\u3000]+/g, ' ')
    .trim();
}

const NON_MENU_CANONICAL_KEYS = NON_MENU_ITEMS.map((item) => normalizeMenuCanonicalKey(item));
const NON_MENU_CANONICAL_SET = new Set<string>(NON_MENU_CANONICAL_KEYS);

export function isNonMenuItem(name: string): boolean {
  const k = normalizeMenuCanonicalKey(name);
  if (!k) return false;
  if (NON_MENU_CANONICAL_SET.has(k)) return true;
  return NON_MENU_CANONICAL_KEYS.some((kw) => k.startsWith(kw));
}

export interface MenuMasterRecord {
  menu_name: string;
  category?: string | null;
  liquor_sub_category?: string | null;
  aliases?: string[] | null;
}

export interface ResolvedMenuInfo {
  canonicalKey: string;
  canonicalName: string;
  rawCategory: string | null;
  majorGroup: MajorMenuGroupKey;
  liquorSubCategory: LiquorSubCategoryKey | null;
  matchedMaster: boolean;
}

export interface MenuMasterIndex {
  byKey: Map<
    string,
    {
      canonicalName: string;
      rawCategory: string | null;
      liquorSubCategory: LiquorSubCategoryKey | null;
    }
  >;
}

export function buildMenuMasterIndex(masters: MenuMasterRecord[]): MenuMasterIndex {
  const byKey = new Map<
    string,
    {
      canonicalName: string;
      rawCategory: string | null;
      liquorSubCategory: LiquorSubCategoryKey | null;
    }
  >();

  for (const m of masters) {
    const cleanName = normalizeMenuDisplayName(m.menu_name);
    if (!cleanName) continue;
    const rawCat = m.category?.trim() || null;
    const subCat = isValidLiquorSubCategory(m.liquor_sub_category)
      ? m.liquor_sub_category
      : null;

    const entry = {
      canonicalName: cleanName,
      rawCategory: rawCat,
      liquorSubCategory: subCat,
    };

    const mainKey = normalizeMenuCanonicalKey(cleanName);
    if (mainKey && !byKey.has(mainKey)) {
      byKey.set(mainKey, entry);
    }
    for (const alias of m.aliases ?? []) {
      const aKey = normalizeMenuCanonicalKey(alias);
      if (aKey && !byKey.has(aKey)) {
        byKey.set(aKey, entry);
      }
    }
  }

  return { byKey };
}

export function resolveMenuWithIndex(
  rawName: string,
  index: MenuMasterIndex,
  fallbackRawCategory?: string | null
): ResolvedMenuInfo {
  const display = normalizeMenuDisplayName(rawName);
  const key = normalizeMenuCanonicalKey(display);
  const master = index.byKey.get(key);

  if (master) {
    const rawCategory = master.rawCategory ?? fallbackRawCategory?.trim() ?? null;
    const majorGroup = mapRawCategoryToMajorGroup(rawCategory);
    const liquorSubCategory =
      majorGroup === 'liquor'
        ? master.liquorSubCategory ?? suggestLiquorSubCategory(master.canonicalName)
        : null;
    return {
      canonicalKey: normalizeMenuCanonicalKey(master.canonicalName) || key,
      canonicalName: master.canonicalName,
      rawCategory,
      majorGroup,
      liquorSubCategory,
      matchedMaster: true,
    };
  }

  const rawCategory = fallbackRawCategory?.trim() || null;
  const majorGroup = mapRawCategoryToMajorGroup(rawCategory);
  const liquorSubCategory =
    majorGroup === 'liquor' ? suggestLiquorSubCategory(display) : null;
  return {
    canonicalKey: key,
    canonicalName: display || rawName.trim(),
    rawCategory,
    majorGroup,
    liquorSubCategory,
    matchedMaster: false,
  };
}

/**
 * 순수 규칙(키워드) 기반 주류 소분류 자동 제안 (AI 호출 0원)
 */
export function suggestLiquorSubCategory(menuName: string): LiquorSubCategoryKey {
  const k = normalizeMenuCanonicalKey(menuName);
  if (/(참이슬|진로|일품진로|처음처럼|새로|한라산|이슬토닉|한라토닉|처처토닉|대선|좋은데이|소주)/.test(k)) {
    return 'soju';
  }
  if (/(막걸리|동동주|청하|백세주|매화수|전통주|산사춘|복분자|산삼주|화요)/.test(k)) {
    return 'makgeolli';
  }
  if (/(생맥|피쳐|피처|눈꽃맥주|눈꽃과일|과일생맥)/.test(k) || (/\d+cc/.test(k) && !/(카스|테라|켈리)/.test(k))) {
    return 'draft_beer';
  }
  if (/(에일|ipa|수제|크래프트|상상페일|스카이파인|스타우트|바이젠|필스너)/.test(k)) {
    return 'craft_beer';
  }
  if (/(카스|테라|켈리|크러시|하이트|오비|맥스|칭따오|하이네켄|스텔라|아사히|버드와이저|코로나|호가든|무알콜맥주|병맥)/.test(k)) {
    return 'bottle_beer';
  }
  return 'other_liquor';
}

/**
 * 순수 규칙(키워드) 기반 초기 카테고리(5종) + 주류 소분류 제안
 */
export function suggestMenuClassification(
  menuName: string,
  existingRawCategory?: string | null
): {
  suggestedCategory: MenuRawCategory | null;
  suggestedLiquorSub: LiquorSubCategoryKey | null;
} {
  if (isValidMenuRawCategory(existingRawCategory)) {
    return {
      suggestedCategory: existingRawCategory,
      suggestedLiquorSub:
        existingRawCategory === '주류' ? suggestLiquorSubCategory(menuName) : null,
    };
  }

  const k = normalizeMenuCanonicalKey(menuName);
  if (/(^s\d+|세트|모둠세트|콤보)/.test(k)) {
    return { suggestedCategory: '세트', suggestedLiquorSub: null };
  }
  if (/(콜라|사이다|생수|음료|빙수|에이드|쥬스|주스|환타|스프라이트|커피|아메리카노)/.test(k)) {
    return { suggestedCategory: '음료', suggestedLiquorSub: null };
  }
  if (
    /(참이슬|진로|처음처럼|새로|한라산|소주|맥주|생맥|피쳐|피처|에일|하이볼|토닉|막걸리|동동주|청하|백세주|매화수|스텔라|카스|테라|켈리|샷추가|레몬추가|산삼주|스카이파인)/.test(
      k
    )
  ) {
    return {
      suggestedCategory: '주류',
      suggestedLiquorSub: suggestLiquorSubCategory(menuName),
    };
  }
  if (/(라면|냉면|국수|찌개|볶음밥|공기밥|밥|우동|칼국수|묵사발)/.test(k)) {
    return { suggestedCategory: '식사', suggestedLiquorSub: null };
  }
  if (/(치킨|떡볶이|먹태|골뱅이|오징어|감자|튀김|샐러드|탕|소세지|만두|닭발|무침|감바스|피타|노가리|육포|나쵸)/.test(k)) {
    return { suggestedCategory: '안주', suggestedLiquorSub: null };
  }

  return { suggestedCategory: null, suggestedLiquorSub: null };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[n];
}

export function menuNameSimilarity(a: string, b: string): number {
  const na = normalizeMenuCanonicalKey(a);
  const nb = normalizeMenuCanonicalKey(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

export interface SimilarMenuSuggestion {
  canonicalCandidate: string;
  variantName: string;
  similarity: number;
}

function extractNumberTokens(canonicalKey: string): string {
  const matches = canonicalKey.match(/\d+/g);
  return matches ? matches.join('|') : '';
}

/**
 * 오탈자 자동 합산은 하지 않고, 기존 Levenshtein >= 0.80 기준 유사 이름 쌍을 제안 목록으로 반환
 * - 두 이름에서 추출한 숫자열이 다르면 제외 (예: 피쳐 2700cc vs 피쳐1700CC, 단위 대소문자 무시)
 * - 메뉴 외 매출(배달비 등) 제외
 */
export function findSimilarMenuPairs(
  entries: Array<{ name: string; count: number; isMaster?: boolean }>,
  minSimilarity = 0.8
): SimilarMenuSuggestion[] {
  const results: SimilarMenuSuggestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    if (isNonMenuItem(entries[i].name)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (isNonMenuItem(b.name)) continue;
      const ka = normalizeMenuCanonicalKey(a.name);
      const kb = normalizeMenuCanonicalKey(b.name);
      if (!ka || !kb || ka === kb) continue;
      if (extractNumberTokens(ka) !== extractNumberTokens(kb)) continue;
      if (Math.abs(ka.length - kb.length) > Math.max(2, Math.floor(Math.max(ka.length, kb.length) * 0.35))) {
        continue;
      }
      const sim = menuNameSimilarity(a.name, b.name);
      if (sim < minSimilarity) continue;

      // 마스터 등록 또는 등장 횟수가 많은 쪽을 정식명 후보로
      const aFirst = a.isMaster && !b.isMaster ? true : !a.isMaster && b.isMaster ? false : a.count >= b.count;
      const canonicalCandidate = aFirst ? a.name : b.name;
      const variantName = aFirst ? b.name : a.name;
      const pairKey = `${normalizeMenuCanonicalKey(canonicalCandidate)}::${normalizeMenuCanonicalKey(variantName)}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      results.push({
        canonicalCandidate,
        variantName,
        similarity: Number(sim.toFixed(2)),
      });
    }
  }

  return results.sort((x, y) => y.similarity - x.similarity);
}
