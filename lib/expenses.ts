import type { PurchaseCategory } from '@/types/purchase';

export type ExpenseGroupKey =
  | 'ingredients'
  | 'labor'
  | 'rent'
  | 'utilities'
  | 'telecom_system'
  | 'fees'
  | 'tax_dues'
  | 'other_ops';

export interface ExpenseGroupMeta {
  key: ExpenseGroupKey;
  label: string;
  shortLabel: string;
  categories: PurchaseCategory[];
  isVariable: boolean; // 손익분기점(BEP) 기준 변동비 여부: 재료비 + 수수료
}

/**
 * 외식업 표준 비용 8개 그룹 단일 정의 상수
 * - 미분류/신규 카테고리는 모두 other_ops(기타 운영비)로 집계
 */
export const EXPENSE_GROUPS: readonly ExpenseGroupMeta[] = [
  {
    key: 'ingredients',
    label: '재료비(원가)',
    shortLabel: '재료비',
    categories: ['food_ingredients', 'alcohol'],
    isVariable: true,
  },
  {
    key: 'labor',
    label: '인건비',
    shortLabel: '인건비',
    categories: ['labor'],
    isVariable: false,
  },
  {
    key: 'rent',
    label: '임대료',
    shortLabel: '임대료',
    categories: ['rent', 'management_fee'],
    isVariable: false,
  },
  {
    key: 'utilities',
    label: '공과금',
    shortLabel: '공과금',
    categories: ['electricity', 'gas', 'water'],
    isVariable: false,
  },
  {
    key: 'telecom_system',
    label: '통신·시스템',
    shortLabel: '통신·시스템',
    categories: ['telecom', 'pos_fee'],
    isVariable: false,
  },
  {
    key: 'fees',
    label: '수수료',
    shortLabel: '수수료',
    categories: ['card_fee', 'delivery_fee'],
    isVariable: true,
  },
  {
    key: 'tax_dues',
    label: '세금과공과',
    shortLabel: '세금과공과',
    categories: ['tax_dues'],
    isVariable: false,
  },
  {
    key: 'other_ops',
    label: '기타 운영비',
    shortLabel: '기타 운영비',
    categories: ['consumables', 'fuel', 'insurance', 'other'],
    isVariable: false,
  },
] as const;

export const PURCHASE_CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  food_ingredients: '식자재',
  alcohol: '주류',
  labor: '인건비(알바비 포함)',
  rent: '임대료',
  management_fee: '관리비',
  electricity: '전기요금',
  gas: '가스요금',
  water: '수도요금',
  telecom: '통신비(인터넷·전화)',
  pos_fee: 'POS 사용료·관리비',
  card_fee: '카드 수수료',
  delivery_fee: '배달 수수료',
  tax_dues: '세금과공과(주민세·면허세 등)',
  consumables: '소모품',
  fuel: '유류비',
  insurance: '보험료',
  other: '기타',
};

export const PURCHASE_CATEGORY_OPTIONS: PurchaseCategory[] = EXPENSE_GROUPS.flatMap(
  (g) => g.categories
);

/** 고정비 설정 화면용 카테고리 목록 (재료비 제외, 수수료·세금과공과 포함) */
export const FIXED_COST_CATEGORY_OPTIONS: { value: PurchaseCategory; label: string }[] = [
  { value: 'rent', label: PURCHASE_CATEGORY_LABELS.rent },
  { value: 'management_fee', label: PURCHASE_CATEGORY_LABELS.management_fee },
  { value: 'labor', label: PURCHASE_CATEGORY_LABELS.labor },
  { value: 'electricity', label: PURCHASE_CATEGORY_LABELS.electricity },
  { value: 'gas', label: PURCHASE_CATEGORY_LABELS.gas },
  { value: 'water', label: PURCHASE_CATEGORY_LABELS.water },
  { value: 'telecom', label: PURCHASE_CATEGORY_LABELS.telecom },
  { value: 'pos_fee', label: PURCHASE_CATEGORY_LABELS.pos_fee },
  { value: 'card_fee', label: PURCHASE_CATEGORY_LABELS.card_fee },
  { value: 'delivery_fee', label: PURCHASE_CATEGORY_LABELS.delivery_fee },
  { value: 'tax_dues', label: PURCHASE_CATEGORY_LABELS.tax_dues },
  { value: 'insurance', label: PURCHASE_CATEGORY_LABELS.insurance },
  { value: 'fuel', label: PURCHASE_CATEGORY_LABELS.fuel },
  { value: 'other', label: PURCHASE_CATEGORY_LABELS.other },
];

const CATEGORY_TO_GROUP_MAP: Record<string, ExpenseGroupKey> = {};
for (const group of EXPENSE_GROUPS) {
  for (const cat of group.categories) {
    CATEGORY_TO_GROUP_MAP[cat] = group.key;
  }
}

export const EXPENSE_GROUP_META_MAP: Record<ExpenseGroupKey, ExpenseGroupMeta> =
  EXPENSE_GROUPS.reduce((acc, g) => {
    acc[g.key] = g;
    return acc;
  }, {} as Record<ExpenseGroupKey, ExpenseGroupMeta>);

export function mapCategoryToExpenseGroup(category?: string | null): ExpenseGroupKey {
  if (!category) return 'other_ops';
  return CATEGORY_TO_GROUP_MAP[category] ?? 'other_ops';
}

export function isKnownPurchaseCategory(category?: string | null): category is PurchaseCategory {
  if (!category) return false;
  return category in CATEGORY_TO_GROUP_MAP;
}

export function isIngredientCategory(category?: string | null): boolean {
  return mapCategoryToExpenseGroup(category) === 'ingredients';
}

export function isVariableCostCategory(category?: string | null): boolean {
  const groupKey = mapCategoryToExpenseGroup(category);
  return EXPENSE_GROUP_META_MAP[groupKey].isVariable;
}

export function getCategoryLabel(category?: string | null): string {
  if (!category) return '미분류';
  return PURCHASE_CATEGORY_LABELS[category as PurchaseCategory] ?? category;
}

export interface ExpenseGroupSummary {
  key: ExpenseGroupKey;
  label: string;
  shortLabel: string;
  amount: number;
  ratioPct: number;
  isVariable: boolean;
  prevAmount: number;
  momDiff: number;
  momChangePct: number | null;
}

export interface ExpenseBreakdown {
  totalExpense: number;
  ingredientCost: number;
  laborCost: number;
  rentCost: number;
  flCost: number;
  utilitiesCost: number;
  telecomSystemCost: number;
  feesCost: number;
  taxDuesCost: number;
  otherOpsCost: number;
  variableCost: number;
  fixedCostFromPurchases: number;
  operatingProfit: number;
  costRatio: number; // 원가율 = 재료비 ÷ 매출 * 100
  laborRatio: number; // 인건비율 = 인건비 ÷ 매출 * 100
  flRatio: number; // FL 비율 = (재료비 + 인건비) ÷ 매출 * 100
  rentRatio: number; // 임대료율 = 임대료 ÷ 매출 * 100
  totalCostRatio: number; // 총비용률 = 총비용 ÷ 매출 * 100
  operatingProfitRatio: number; // 영업이익률 = 남은 돈 ÷ 매출 * 100
  groups: ExpenseGroupSummary[];
  groupTotals: Record<ExpenseGroupKey, number>;
  unmappedCategories: string[];
}

export function calculateExpenseBreakdown(
  purchases: Array<{ category?: string | null; total_amount?: number | null; totalAmount?: number | null }>,
  totalRevenue: number,
  prevGroupTotals?: Partial<Record<ExpenseGroupKey, number>> | null
): ExpenseBreakdown {
  const groupTotals: Record<ExpenseGroupKey, number> = {
    ingredients: 0,
    labor: 0,
    rent: 0,
    utilities: 0,
    telecom_system: 0,
    fees: 0,
    tax_dues: 0,
    other_ops: 0,
  };
  const unmappedSet = new Set<string>();

  for (const p of purchases) {
    const amt = Number(p.total_amount ?? p.totalAmount ?? 0) || 0;
    const rawCat = p.category;
    if (rawCat && !isKnownPurchaseCategory(rawCat)) {
      unmappedSet.add(rawCat);
    }
    const groupKey = mapCategoryToExpenseGroup(rawCat);
    groupTotals[groupKey] += amt;
  }

  const totalExpense = EXPENSE_GROUPS.reduce((sum, g) => sum + groupTotals[g.key], 0);
  const ingredientCost = groupTotals.ingredients;
  const laborCost = groupTotals.labor;
  const rentCost = groupTotals.rent;
  const flCost = ingredientCost + laborCost;
  const utilitiesCost = groupTotals.utilities;
  const telecomSystemCost = groupTotals.telecom_system;
  const feesCost = groupTotals.fees;
  const taxDuesCost = groupTotals.tax_dues;
  const otherOpsCost = groupTotals.other_ops;

  const variableCost = EXPENSE_GROUPS.reduce(
    (sum, g) => (g.isVariable ? sum + groupTotals[g.key] : sum),
    0
  );
  const fixedCostFromPurchases = totalExpense - variableCost;
  const operatingProfit = totalRevenue - totalExpense;

  const pct = (num: number) => (totalRevenue > 0 ? (num / totalRevenue) * 100 : 0);

  const groups: ExpenseGroupSummary[] = EXPENSE_GROUPS.map((g) => {
    const amount = groupTotals[g.key];
    const prevAmount = prevGroupTotals?.[g.key] ?? 0;
    const momDiff = amount - prevAmount;
    const momChangePct = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : null;
    return {
      key: g.key,
      label: g.label,
      shortLabel: g.shortLabel,
      amount,
      ratioPct: pct(amount),
      isVariable: g.isVariable,
      prevAmount,
      momDiff,
      momChangePct,
    };
  });

  return {
    totalExpense,
    ingredientCost,
    laborCost,
    rentCost,
    flCost,
    utilitiesCost,
    telecomSystemCost,
    feesCost,
    taxDuesCost,
    otherOpsCost,
    variableCost,
    fixedCostFromPurchases,
    operatingProfit,
    costRatio: pct(ingredientCost),
    laborRatio: pct(laborCost),
    flRatio: pct(flCost),
    rentRatio: pct(rentCost),
    totalCostRatio: pct(totalExpense),
    operatingProfitRatio: pct(operatingProfit),
    groups,
    groupTotals,
    unmappedCategories: Array.from(unmappedSet),
  };
}

