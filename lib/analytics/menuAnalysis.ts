import {
  buildMenuMasterIndex,
  getMajorGroupLabel,
  isNonMenuItem,
  LIQUOR_SUB_CATEGORIES,
  LiquorSubCategoryKey,
  MajorMenuGroupKey,
  MENU_MAJOR_GROUPS,
  MenuMasterRecord,
  resolveMenuWithIndex,
} from '@/lib/menus';

export interface MenuSaleInputRow {
  date: string;
  net_revenue?: number | null;
  sales_menu_items?: Array<{
    name?: string | null;
    quantity?: number | null;
    amount?: number | null;
    category?: string | null;
  }> | null;
}

export interface MenuMajorGroupStat {
  key: MajorMenuGroupKey;
  label: string;
  amount: number;
  sharePct: number;
  quantity: number;
}

export interface LiquorSubStat {
  key: LiquorSubCategoryKey;
  label: string;
  amount: number;
  quantity: number;
  shareOfLiquorPct: number;
  shareOfTotalPct: number;
}

export interface AnalyzedMenuItem {
  canonicalKey: string;
  name: string;
  rawCategory: string | null;
  majorGroup: MajorMenuGroupKey;
  majorLabel: string;
  liquorSubCategory: LiquorSubCategoryKey | null;
  liquorSubLabel: string | null;
  quantity: number;
  amount: number;
  sharePct: number;
  cumSharePct: number;
  tier: 'top70' | 'mid' | 'bottom10';
  isUnclassified: boolean;
}

export interface NonMenuSaleSummaryItem {
  name: string;
  quantity: number;
  amount: number;
  sharePct: number;
}

export interface MenuPeriodAnalysis {
  hasMenuData: boolean;
  dataStatus: 'none' | 'partial' | 'complete';
  totalSalesDays: number;
  daysWithMenuData: number;
  totalMenuSales: number;
  rawItemsSumBeforeScale: number;
  majorGroups: MenuMajorGroupStat[];
  majorAmounts: Record<MajorMenuGroupKey, number>;
  majorShares: Record<MajorMenuGroupKey, number>;
  liquorSubGroups: LiquorSubStat[];
  liquorSubAmounts: Record<LiquorSubCategoryKey, number>;
  liquorCost: number;
  foodPurchaseCost: number;
  liquorCostRatio: number | null; // 주류 매입 ÷ 주류 매출 * 100
  foodCostRatio: number | null;   // 식자재 매입 ÷ 안주·식사 매출 * 100
  unclassifiedCount: number;
  unclassifiedNames: string[];
  menus: AnalyzedMenuItem[];
  top70Menus: AnalyzedMenuItem[];
  bottom10Menus: AnalyzedMenuItem[];
  nonMenuTotalAmount: number;
  nonMenuTotalQuantity: number;
  nonMenuItems: NonMenuSaleSummaryItem[];
}

export function analyzeMenuPeriod(
  sales: MenuSaleInputRow[],
  purchases: Array<{ category?: string | null; total_amount?: number | null }>,
  masterRows: MenuMasterRecord[]
): MenuPeriodAnalysis {
  const masterIndex = buildMenuMasterIndex(masterRows);
  const totalSalesDays = sales.length;
  let daysWithMenuData = 0;

  let rawItemsSumBeforeScale = 0;
  let totalMenuSalesFloat = 0;

  const menuAgg = new Map<
    string,
    {
      canonicalKey: string;
      name: string;
      rawCategory: string | null;
      majorGroup: MajorMenuGroupKey;
      liquorSubCategory: LiquorSubCategoryKey | null;
      quantity: number;
      floatAmount: number;
      isUnclassified: boolean;
    }
  >();

  for (const sale of sales) {
    const items = sale.sales_menu_items ?? [];
    if (items.length === 0) continue;
    daysWithMenuData++;

    const itemsSum = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    rawItemsSumBeforeScale += itemsSum;
    const netRev = Number(sale.net_revenue) || 0;
    const scale = itemsSum > 0 ? netRev / itemsSum : 0;

    for (const it of items) {
      const rawName = it.name ?? '';
      if (!rawName.trim()) continue;

      const resolved = resolveMenuWithIndex(rawName, masterIndex, it.category);
      const key = resolved.canonicalKey;
      if (!key) continue;

      const scaledAmt = (Number(it.amount) || 0) * scale;
      const qty = Number(it.quantity) || 0;
      totalMenuSalesFloat += scaledAmt;

      const existing = menuAgg.get(key);
      if (!existing) {
        menuAgg.set(key, {
          canonicalKey: key,
          name: resolved.canonicalName,
          rawCategory: resolved.rawCategory,
          majorGroup: resolved.majorGroup,
          liquorSubCategory: resolved.liquorSubCategory,
          quantity: qty,
          floatAmount: scaledAmt,
          isUnclassified: !resolved.rawCategory,
        });
      } else {
        existing.quantity += qty;
        existing.floatAmount += scaledAmt;
        if (!existing.rawCategory && resolved.rawCategory) {
          existing.rawCategory = resolved.rawCategory;
          existing.majorGroup = resolved.majorGroup;
          existing.liquorSubCategory = resolved.liquorSubCategory;
          existing.isUnclassified = false;
        }
      }
    }
  }

  const hasMenuData = daysWithMenuData > 0 && menuAgg.size > 0;
  const dataStatus: 'none' | 'partial' | 'complete' = !hasMenuData
    ? 'none'
    : daysWithMenuData < totalSalesDays
    ? 'partial'
    : 'complete';

  // 정수 반올림 시 합계가 1원 단위로 어긋나지 않도록 정렬 후 반올림 잔차(최대 몇 원)를 1위 항목이 아닌 정확 합산과 비교
  const sortedRaw = Array.from(menuAgg.values()).sort((a, b) => b.floatAmount - a.floatAmount);
  const roundedTotalTarget = Math.round(totalMenuSalesFloat);
  const preliminaryRounded = sortedRaw.map((m) => Math.round(m.floatAmount));
  let roundedSum = preliminaryRounded.reduce((s, v) => s + v, 0);
  if (sortedRaw.length > 0 && roundedSum !== roundedTotalTarget) {
    // 1원 단위 반올림 차이를 매출 최상위 메뉴(0번)에 보정해 메뉴 합계 === 메뉴별 매출 총액 정확 일치 보장
    preliminaryRounded[0] += roundedTotalTarget - roundedSum;
    roundedSum = roundedTotalTarget;
  }

  const totalMenuSales = roundedSum;

  const majorAmounts: Record<MajorMenuGroupKey, number> = {
    liquor: 0,
    food: 0,
    other: 0,
  };
  const majorQuantities: Record<MajorMenuGroupKey, number> = {
    liquor: 0,
    food: 0,
    other: 0,
  };

  const liquorSubAmounts: Record<LiquorSubCategoryKey, number> = {
    soju: 0,
    draft_beer: 0,
    bottle_beer: 0,
    craft_beer: 0,
    makgeolli: 0,
    other_liquor: 0,
  };
  const liquorSubQuantities: Record<LiquorSubCategoryKey, number> = {
    soju: 0,
    draft_beer: 0,
    bottle_beer: 0,
    craft_beer: 0,
    makgeolli: 0,
    other_liquor: 0,
  };

  const unclassifiedNames: string[] = [];

  // 배달비 등 메뉴 외 항목은 대분류·매출 총액에는 포함하되, 순위/상·하위/분류필요에서는 제외
  const rankedItems: AnalyzedMenuItem[] = [];
  const nonMenuItems: NonMenuSaleSummaryItem[] = [];
  let nonMenuTotalAmount = 0;
  let nonMenuTotalQuantity = 0;

  for (let idx = 0; idx < sortedRaw.length; idx++) {
    const m = sortedRaw[idx];
    const amount = preliminaryRounded[idx];
    const isNonMenu = isNonMenuItem(m.name);
    const effectiveMajorGroup: MajorMenuGroupKey = isNonMenu ? 'other' : m.majorGroup;
    const sharePct = totalMenuSales > 0 ? (amount / totalMenuSales) * 100 : 0;

    majorAmounts[effectiveMajorGroup] += amount;
    majorQuantities[effectiveMajorGroup] += m.quantity;

    if (!isNonMenu && m.majorGroup === 'liquor' && m.liquorSubCategory) {
      liquorSubAmounts[m.liquorSubCategory] += amount;
      liquorSubQuantities[m.liquorSubCategory] += m.quantity;
    }

    if (isNonMenu) {
      nonMenuTotalAmount += amount;
      nonMenuTotalQuantity += m.quantity;
      nonMenuItems.push({
        name: m.name,
        quantity: m.quantity,
        amount,
        sharePct,
      });
      continue;
    }

    if (m.isUnclassified) {
      unclassifiedNames.push(m.name);
    }

    const liquorSubLabel =
      m.liquorSubCategory !== null
        ? LIQUOR_SUB_CATEGORIES.find((s) => s.key === m.liquorSubCategory)?.label ?? null
        : null;

    rankedItems.push({
      canonicalKey: m.canonicalKey,
      name: m.name,
      rawCategory: m.rawCategory,
      majorGroup: m.majorGroup,
      majorLabel: getMajorGroupLabel(m.majorGroup),
      liquorSubCategory: m.liquorSubCategory,
      liquorSubLabel,
      quantity: m.quantity,
      amount,
      sharePct,
      cumSharePct: 0,
      tier: 'mid',
      isUnclassified: m.isUnclassified,
    });
  }

  // 메뉴 외 항목을 제외한 순위 메뉴 기준 누적 비중(상위 70% / 하위 10%) 계산
  const rankedMenuTotal = rankedItems.reduce((s, item) => s + item.amount, 0);
  let runningRankedAmt = 0;
  const menus: AnalyzedMenuItem[] = rankedItems.map((item) => {
    runningRankedAmt += item.amount;
    const cumSharePct = rankedMenuTotal > 0 ? (runningRankedAmt / rankedMenuTotal) * 100 : 0;
    return { ...item, cumSharePct };
  });

  // 상위(누적 70%까지) 부여: 이전 메뉴까지의 누적이 70% 미만인 메뉴까지 포함
  let prevCum = 0;
  for (const item of menus) {
    if (rankedMenuTotal > 0 && item.amount > 0 && prevCum < 70) {
      item.tier = 'top70';
    }
    prevCum = item.cumSharePct;
  }

  // 하위(누적 하위 10%) 부여: 순위 메뉴 합계 기준 맨 아래부터 누적 10% 이내
  let tailCum = 0;
  for (let i = menus.length - 1; i >= 0; i--) {
    const item = menus[i];
    if (item.tier === 'top70') continue;
    if (rankedMenuTotal <= 0) break;
    const itemRankSharePct = (item.amount / rankedMenuTotal) * 100;
    const nextTailCum = tailCum + itemRankSharePct;
    if (tailCum < 10 && nextTailCum <= 12) {
      item.tier = 'bottom10';
      tailCum = nextTailCum;
    } else if (tailCum === 0 && itemRankSharePct <= 10) {
      item.tier = 'bottom10';
      tailCum = nextTailCum;
    } else {
      break;
    }
  }

  const majorShares: Record<MajorMenuGroupKey, number> = {
    liquor: totalMenuSales > 0 ? (majorAmounts.liquor / totalMenuSales) * 100 : 0,
    food: totalMenuSales > 0 ? (majorAmounts.food / totalMenuSales) * 100 : 0,
    other: totalMenuSales > 0 ? (majorAmounts.other / totalMenuSales) * 100 : 0,
  };

  const majorGroups: MenuMajorGroupStat[] = MENU_MAJOR_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    amount: majorAmounts[g.key],
    sharePct: majorShares[g.key],
    quantity: majorQuantities[g.key],
  }));

  const liquorTotal = majorAmounts.liquor;
  const liquorSubGroups: LiquorSubStat[] = LIQUOR_SUB_CATEGORIES.map((s) => ({
    key: s.key,
    label: s.label,
    amount: liquorSubAmounts[s.key],
    quantity: liquorSubQuantities[s.key],
    shareOfLiquorPct: liquorTotal > 0 ? (liquorSubAmounts[s.key] / liquorTotal) * 100 : 0,
    shareOfTotalPct: totalMenuSales > 0 ? (liquorSubAmounts[s.key] / totalMenuSales) * 100 : 0,
  }));

  // 주류 원가율 = 주류 매입(alcohol) ÷ 주류 매출
  // 안주 원가율 = 식자재 매입(food_ingredients) ÷ 안주·식사 매출
  const liquorCost = purchases
    .filter((p) => p.category === 'alcohol')
    .reduce((s, p) => s + (Number(p.total_amount) || 0), 0);
  const foodPurchaseCost = purchases
    .filter((p) => p.category === 'food_ingredients')
    .reduce((s, p) => s + (Number(p.total_amount) || 0), 0);

  const liquorCostRatio = majorAmounts.liquor > 0 ? (liquorCost / majorAmounts.liquor) * 100 : null;
  const foodCostRatio = majorAmounts.food > 0 ? (foodPurchaseCost / majorAmounts.food) * 100 : null;

  return {
    hasMenuData,
    dataStatus,
    totalSalesDays,
    daysWithMenuData,
    totalMenuSales,
    rawItemsSumBeforeScale,
    majorGroups,
    majorAmounts,
    majorShares,
    liquorSubGroups,
    liquorSubAmounts,
    liquorCost,
    foodPurchaseCost,
    liquorCostRatio,
    foodCostRatio,
    unclassifiedCount: unclassifiedNames.length,
    unclassifiedNames,
    menus,
    top70Menus: menus.filter((m) => m.tier === 'top70'),
    bottom10Menus: menus.filter((m) => m.tier === 'bottom10'),
    nonMenuTotalAmount,
    nonMenuTotalQuantity,
    nonMenuItems,
  };
}
