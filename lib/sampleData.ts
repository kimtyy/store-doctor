/**
 * 플랜 잠금 시 보여줄 가짜 샘플 데이터
 * 사용자가 상위 플랜에서 어떤 분석을 볼 수 있는지 직관적으로 파악할 수 있도록 돕습니다.
 */

export const SAMPLE_DASHBOARD_DATA = {
  // Free 사용자에게 잠기는 당월 상세 비율
  ratios: {
    costRatio: 32.4, // 원가율 32.4%
    costRatioDiff: -1.8,
    flRatio: 56.1, // FL 56.1%
    flRatioDiff: 0.5,
    operatingProfitRatio: 23.5, // 영업이익률 23.5%
    operatingProfitRatioDiff: 2.1,
  },
  // 요일별 매출
  dowAverages: [
    { dow: '일', sales: 1250000 },
    { dow: '월', sales: 680000 },
    { dow: '화', sales: 720000 },
    { dow: '수', sales: 810000 },
    { dow: '목', sales: 940000 },
    { dow: '금', sales: 1680000 },
    { dow: '토', sales: 1850000 },
  ],
  // 요일별 매출 비교 (Basic 잠금 샘플)
  sameDayComparison: {
    dowLabel: '토',
    lastWeek: 1850000,
    twoWeeksAgo: 1720000,
    lastMonthAvg: 1680000,
    lastMonthCount: 4,
  },
  // 기간 메뉴 비교
  periodMenuComparison: {
    risingGroup: [
      { name: '순살양념치킨', thisPeriodQty: 142, lastPeriodQty: 111, diff: 31, rate: 27.9, isNew: false },
      { name: '매콤국물떡볶이', thisPeriodQty: 98, lastPeriodQty: 82, diff: 16, rate: 19.5, isNew: false },
      { name: '얼큰해물짬뽕탕', thisPeriodQty: 76, lastPeriodQty: 66, diff: 10, rate: 15.2, isNew: false },
    ],
    fallingGroup: [
      { name: '부산어묵탕', thisPeriodQty: 45, lastPeriodQty: 58, diff: -13, rate: -22.4, isNew: false },
      { name: '먹태구이', thisPeriodQty: 54, lastPeriodQty: 66, diff: -12, rate: -18.2, isNew: false },
    ],
  },
  // Pro 잠금: 이동평균 샘플 (5/20/60/120)
  sampleMAChartData: Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const revBase = 1200000 + Math.sin(i / 3) * 300000 + (i % 7 >= 5 ? 400000 : 0);
    const costBase = revBase * 0.33;
    const profitBase = revBase - costBase;
    return {
      date: `05-${String(day).padStart(2, '0')}`,
      revenueMa5: Math.round(revBase * 0.98),
      revenueMa20: Math.round(revBase * 0.95),
      revenueMa60: 1250000,
      revenueMa120: 1220000,
      costMa5: Math.round(costBase * 0.98),
      costMa20: Math.round(costBase * 0.95),
      costMa60: 410000,
      costMa120: 400000,
      profitMa5: Math.round(profitBase * 0.98),
      profitMa20: Math.round(profitBase * 0.95),
      profitMa60: 840000,
      profitMa120: 820000,
      costRatioMa5: 32.8,
      costRatioMa20: 33.1,
      costRatioMa60: 32.5,
      costRatioMa120: 32.0,
    };
  }),
  // Pro 잠금: 원가율 경고
  costRatioWarning: {
    title: '주류 원가율 주의',
    message: '최근 2주간 주류 매입 단가 인상으로 주류 원가율이 전월 대비 4.2%p 상승했습니다.',
    level: 'warning',
  },
  // Pro 잠금: 기온 급락 3일 띠
  tempDropAlert: {
    cards: [
      { date: '오늘', delta: -4.5, title: '어제 4.5°C 하락', desc: '오늘은 매출이 평소보다 약 20% 낮을 수 있어요 (지난 급락 73번 평균)' },
      { date: '내일', delta: -1.2, title: '기온 저점 유지', desc: '내일도 평소보다 약 10% 낮을 수 있어요' },
      { date: '모레', delta: 2.1, title: '기온 평년 회복', desc: '사흘째부터 평소 매출로 회복되는 경향을 보여요' },
    ],
  },
};

export const SAMPLE_MENU_ANALYSIS = {
  summary: {
    totalSales: 28450000,
    totalQty: 2140,
    liquorShare: 42.5,
    foodShare: 51.2,
    otherShare: 6.3,
  },
  topMenus: [
    { rank: 1, name: '생맥주 500cc', category: '주류', qty: 820, sales: 4100000, share: 14.4 },
    { rank: 2, name: '순살후라이드치킨', category: '식사/안주', qty: 210, sales: 3990000, share: 14.0 },
    { rank: 3, name: '골뱅이소면무침', category: '식사/안주', qty: 145, sales: 2900000, share: 10.2 },
    { rank: 4, name: '참이슬 후레쉬', category: '주류', qty: 450, sales: 2250000, share: 7.9 },
    { rank: 5, name: '모둠소시지구이', category: '식사/안주', qty: 110, sales: 1980000, share: 7.0 },
  ],
};

export const SAMPLE_REPORT_DATA = {
  bep: {
    fixedCostsSum: 6200000,
    variableCostRatio: 0.38,
    bep: 10000000,
    bepShortfall: -4500000,
    aiDiagnosis: '현재 일평균 115만원으로 손익분기점(월 1,000만원)을 안정적으로 초과 달성 중입니다. 식자재 로스율을 2% 줄이면 월 40만원의 추가 영업이익 개선이 가능합니다.',
  },
  prediction: {
    predictedMin: 28500000,
    predictedMax: 32000000,
    seasonality: '초여름 야외 맥주 성수기 진입',
    aiDiagnosis: '다음 달은 기온 상승과 연휴 영향으로 주류 매출이 15% 이상 증가할 것으로 예상됩니다. 생맥주 케그 및 잔 재고를 사전 확보하세요.',
  },
  aiDiagnosis: '이번 달은 원가율이 1.8%p 개선되어 순이익이 전월 대비 14% 상승했습니다. 특히 금·토요일 객단가가 상승했으니 주말 안주 세트 메뉴 프로모션을 유지하시는 것을 권장합니다.',
  weatherAiDiagnosis: '비가 오는 날은 탕류 및 전류 메뉴의 주문 비중이 35% 증가하고 배달 매출이 20% 늘어나는 패턴을 보입니다. 우천 예보 시 탕거리 식자재 발주를 1.2배 늘리세요.',
};

