'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const WEATHER_EMOJI: Record<string, string> = {
  '맑음': '☀️',
  '흐림': '☁️',
  '비': '🌧',
  '눈': '❄️'
};

function calcVariance(current: number, base: number) {
  if (!base || base === 0) return 0;
  return ((current - base) / base) * 100;
}

function ComparisonCell({ current, base, formatter = fmt, suffix = '원' }: { current: number, base: number, formatter?: any, suffix?: string }) {
  const v = calcVariance(current, base);
  return (
    <div className="flex flex-col items-center sm:items-end justify-center">
      <span className="font-semibold text-slate-700 text-sm">{formatter(base)}{suffix}</span>
      {base > 0 ? (
        <span className={`text-[10px] font-bold px-1 py-0.5 mt-0.5 rounded ${v > 0 ? 'bg-emerald-100 text-emerald-700' : v < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
          {v > 0 ? '↑' : v < 0 ? '↓' : '-'} {Math.abs(v).toFixed(1)}%
        </span>
      ) : (
        <span className="text-[10px] text-slate-400 mt-0.5">-</span>
      )}
    </div>
  );
}

function MonthlyReportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!year || !month) return;
    
    setLoading(true);
    fetch(`/api/analytics/report?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [year, month]);

  if (!year || !month) return <div className="p-8 text-center text-slate-100">잘못된 접근입니다.</div>;
  if (loading) return <div className="p-8 text-center text-slate-400 animate-pulse">보고서 생성 중...</div>;
  if (error) return <div className="p-8 text-center text-rose-400">오류: {error}</div>;
  if (!data) return null;

  const fmt = (n: number) => n.toLocaleString();
  const fmtMan = (n: number) => (n / 10000).toFixed(1) + '만';

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = () => {
    // Generate simple CSV
    let csv = '\uFEFF'; // BOM
    csv += `매장명,${data.storeName}\n`;
    csv += `보고 기간,${data.year}년 ${data.month}월\n`;
    csv += `생성일시,${new Date(data.generatedAt).toLocaleString('ko-KR')}\n\n`;
    
    csv += `[매출 요약]\n`;
    csv += `총매출,${data.sales.totalRevenue}\n`;
    csv += `순매출,${data.sales.netRevenue}\n`;
    csv += `영업일수,${data.sales.openDays}\n`;
    csv += `평균일매출,${data.sales.avgDailySales}\n`;
    csv += `현금결제,${data.sales.cashAmount}\n`;
    csv += `카드결제,${data.sales.cardAmount}\n\n`;

    csv += `[매입 요약]\n`;
    csv += `총매입(원가),${data.purchases.totalPurchase}\n`;
    csv += `원가율,${data.purchases.costRatio}%\n\n`;

    csv += `[손익 계산서]\n`;
    csv += `영업이익,${data.profit.operatingProfit}\n`;
    csv += `대출금 상환,${data.profit.loanRepayment}\n`;
    csv += `사장님 인건비,${data.profit.ownerSalary}\n`;
    csv += `실질 순이익,${data.profit.netProfit}\n\n`;

    if (data.comparison) {
      csv += `[기간 비교 분석]\n`;
      csv += `항목,이번달,전월,전년동월\n`;
      csv += `총매출,${data.comparison.current.totalRevenue},${data.comparison.prev.totalRevenue},${data.comparison.lastYear.totalRevenue}\n`;
      csv += `원가율,${data.comparison.current.costRatio.toFixed(1)}%,${data.comparison.prev.costRatio.toFixed(1)}%,${data.comparison.lastYear.costRatio.toFixed(1)}%\n`;
      csv += `영업이익,${data.comparison.current.operatingProfit},${data.comparison.prev.operatingProfit},${data.comparison.lastYear.operatingProfit}\n`;
      csv += `일평균매출,${data.comparison.current.avgDailySales},${data.comparison.prev.avgDailySales},${data.comparison.lastYear.avgDailySales}\n`;
      csv += `객단가,${data.comparison.current.avgSpend},${data.comparison.prev.avgSpend},${data.comparison.lastYear.avgSpend}\n`;
      csv += `영업일수,${data.comparison.current.openDays}일,${data.comparison.prev.openDays}일,${data.comparison.lastYear.openDays}일\n\n`;
    }

    if (data.prediction) {
      csv += `[다음달 예측 (${data.prediction.nextMonth}월)]\n`;
      if (!data.prediction.hasEnoughData) {
        csv += `안내,데이터가 쌓일수록 예측 정확도가 높아집니다 (현재 6개월 미만)\n`;
      }
      csv += `매출 예측 범위,${data.prediction.predictedMin} ~ ${data.prediction.predictedMax}원\n`;
      csv += `예측 근거,"${data.prediction.predictionBasis}"\n`;
      csv += `계절성/날씨 영향,"${data.prediction.seasonality}"\n`;
      csv += `공휴일/주말,"${data.prediction.holidays.join(', ')} / 주말 ${data.prediction.weekendCount}일"\n`;
      csv += `주류 발주 권장,${data.prediction.recommendedAlcohol}원 수준\n`;
      csv += `식자재 발주 권장,${data.prediction.recommendedFood}원 수준\n`;
      csv += `AI 종합 예측,"${data.prediction.aiDiagnosis}"\n\n`;
    }

    csv += `[손익분기점 분석]\n`;
    csv += `고정비 합계,${data.bep.fixedCostsSum}\n`;
    csv += `평균 변동비율,${(data.bep.variableCostRatio * 100).toFixed(1)}%\n`;
    csv += `손익분기점,${data.bep.bep}\n`;
    csv += `현재 월매출,${data.bep.currentRevenue}\n`;
    csv += `${data.bep.bepShortfall > 0 ? '부족액' : '초과액'},${data.bep.bepShortfall > 0 ? '-' : '+'}${Math.abs(data.bep.bepShortfall)}\n`;
    csv += `AI 진단,"${data.bep.aiDiagnosis}"\n\n`;

    if (data.weather?.stats?.length > 0) {
      csv += `[날씨별 매출 상관관계]\n`;
      data.weather.stats.forEach((w: any) => {
        csv += `${w.condition} (${w.days}일),평균 ${w.avgRevenue}원\n`;
      });
      if (data.weather.aiDiagnosis) {
        csv += `AI 진단,"${data.weather.aiDiagnosis}"\n`;
      }
      csv += `\n`;
    }

    csv += `[AI 한줄 진단]\n`;
    csv += `"${data.aiDiagnosis}"\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.storeName}_${data.year}년_${data.month}월_영업보고서.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 print:bg-white pb-20">
      {/* Top Actions (Hidden in print) */}
      <div className="sticky top-0 bg-white/90 backdrop-blur shadow-sm p-4 flex gap-2 print:hidden z-50">
        <button onClick={() => router.back()} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300 transition">
          ← 뒤로
        </button>
        <div className="flex-1" />
        <button onClick={handleExcel} className="rounded-xl bg-emerald-100 text-emerald-800 px-4 py-2 text-sm font-semibold hover:bg-emerald-200 transition">
          엑셀 다운로드
        </button>
        <button onClick={handlePrint} className="rounded-xl bg-sky-600 text-white px-4 py-2 text-sm font-semibold hover:bg-sky-500 transition">
          PDF 저장
        </button>
      </div>

      <main className="max-w-2xl mx-auto p-6 space-y-8 bg-white shadow-sm mt-4 print:shadow-none print:mt-0 print:p-0">
        
        {/* Header */}
        <header className="text-center space-y-2 border-b-2 border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">{data.storeName} 월별 영업보고서</h1>
          <p className="text-lg font-medium text-slate-600">{data.year}년 {data.month}월</p>
        </header>

        {/* AI Diagnosis */}
        <section className="bg-sky-50 border border-sky-200 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-sky-800 mb-2 flex items-center gap-1">
            <span>✨</span> AI 한줄 진단
          </h2>
          <div className="text-slate-800 font-medium leading-relaxed prose prose-sm prose-slate max-w-none prose-p:my-1 prose-headings:my-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.aiDiagnosis}</ReactMarkdown>
          </div>
        </section>

        {/* Sales Summary */}
        <section>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">매출 요약</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">총매출</p>
              <p className="text-2xl font-bold text-slate-900">{fmt(data.sales.totalRevenue)}원</p>
              <p className="text-xs text-slate-500 mt-1">
                전월 대비: <span className={data.sales.momChangePct >= 0 ? 'text-sky-600' : 'text-rose-600'}>
                  {data.sales.momChangePct > 0 ? '+' : ''}{data.sales.momChangePct.toFixed(1)}%
                </span>
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">순매출 (세금 제외)</p>
              <p className="text-2xl font-bold text-slate-900">{fmt(data.sales.netRevenue)}원</p>
              <p className="text-xs text-slate-500 mt-1">
                서비스 금액: {fmt(data.sales.serviceAmount)}원
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">영업일 / 일평균매출</p>
              <p className="text-xl font-bold text-slate-900">{data.sales.openDays}일 / {fmtMan(data.sales.avgDailySales)}원</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">결제 비율 (현금 : 카드)</p>
              <p className="text-xl font-bold text-slate-900">
                {data.sales.totalRevenue > 0 ? Math.round((data.sales.cashAmount / data.sales.totalRevenue) * 100) : 0}% : 
                {data.sales.totalRevenue > 0 ? Math.round((data.sales.cardAmount / data.sales.totalRevenue) * 100) : 0}%
              </p>
            </div>
          </div>
        </section>

        {/* Purchase Summary */}
        <section>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">매입 요약 (원가)</h2>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-500 mb-1">총매입(원가)</p>
              <p className="text-2xl font-bold text-rose-600">{fmt(data.purchases.totalPurchase)}원</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500 mb-1">매출 대비 원가율</p>
              <p className="text-2xl font-bold text-slate-900">{data.purchases.costRatio.toFixed(1)}%</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {data.purchases.categories.map((c: any) => (
              <div key={c.name} className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-600">{c.name}</span>
                <span className="font-semibold text-slate-800">{fmt(c.amount)}원</span>
              </div>
            ))}
          </div>
        </section>

        {/* Profit Summary */}
        <section>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">손익 계산서</h2>
          <div className="bg-slate-800 text-slate-100 p-5 rounded-2xl shadow-lg space-y-4">
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-sky-300 uppercase tracking-wide border-b border-slate-700 pb-1">영업이익</h3>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">총매출</span>
                <span>{fmt(data.sales.totalRevenue)}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">총매입(원가)</span>
                <span className="text-rose-400">-{fmt(data.purchases.totalPurchase)}원</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                <span>영업이익</span>
                <span className={data.profit.operatingProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {data.profit.operatingProfit >= 0 ? '+' : ''}{fmt(data.profit.operatingProfit)}원
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <h3 className="text-sm font-semibold text-rose-300 uppercase tracking-wide border-b border-slate-700 pb-1">영업외 지출</h3>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">대출금 상환</span>
                <span className="text-rose-400">-{fmt(data.profit.loanRepayment)}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">사장님 인건비</span>
                <span className="text-rose-400">-{fmt(data.profit.ownerSalary)}원</span>
              </div>
            </div>

            <div className="pt-4 border-t-2 border-slate-600 mt-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-base font-bold text-white">실질 순이익</p>
                  <p className="text-xs text-slate-400 mt-0.5">실제 내 손에 남는 돈 (총비용률 {data.profit.totalCostRatio.toFixed(1)}%)</p>
                </div>
                <span className={`text-2xl font-black ${data.profit.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.profit.netProfit >= 0 ? '+' : ''}{fmt(data.profit.netProfit)}원
                </span>
              </div>
            </div>
            
          </div>
        </section>

        {/* Period Comparison */}
        {data.comparison && (
          <section>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">기간 비교 분석</h2>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-center">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                    <tr>
                      <th className="p-3 font-semibold text-left">항목</th>
                      <th className="p-3 font-semibold">이번달<br/><span className="font-normal text-[10px]">({data.year}.{data.month})</span></th>
                      <th className="p-3 font-semibold">전월<br/><span className="font-normal text-[10px]">대비</span></th>
                      <th className="p-3 font-semibold">전년동월<br/><span className="font-normal text-[10px]">대비</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-3 text-left font-semibold text-slate-700">총매출</td>
                      <td className="p-3 font-bold text-slate-900">{fmt(data.comparison.current.totalRevenue)}원</td>
                      <td className="p-3 bg-slate-50/50"><ComparisonCell current={data.comparison.current.totalRevenue} base={data.comparison.prev.totalRevenue} /></td>
                      <td className="p-3"><ComparisonCell current={data.comparison.current.totalRevenue} base={data.comparison.lastYear.totalRevenue} /></td>
                    </tr>
                    <tr>
                      <td className="p-3 text-left font-semibold text-slate-700">원가율</td>
                      <td className="p-3 font-bold text-slate-900">{data.comparison.current.costRatio.toFixed(1)}%</td>
                      <td className="p-3 bg-slate-50/50"><ComparisonCell current={data.comparison.current.costRatio} base={data.comparison.prev.costRatio} formatter={(v: number) => v.toFixed(1)} suffix="%" /></td>
                      <td className="p-3"><ComparisonCell current={data.comparison.current.costRatio} base={data.comparison.lastYear.costRatio} formatter={(v: number) => v.toFixed(1)} suffix="%" /></td>
                    </tr>
                    <tr>
                      <td className="p-3 text-left font-semibold text-slate-700">영업이익</td>
                      <td className="p-3 font-bold text-slate-900">{fmt(data.comparison.current.operatingProfit)}원</td>
                      <td className="p-3 bg-slate-50/50"><ComparisonCell current={data.comparison.current.operatingProfit} base={data.comparison.prev.operatingProfit} /></td>
                      <td className="p-3"><ComparisonCell current={data.comparison.current.operatingProfit} base={data.comparison.lastYear.operatingProfit} /></td>
                    </tr>
                    <tr>
                      <td className="p-3 text-left font-semibold text-slate-700">일평균매출</td>
                      <td className="p-3 font-bold text-slate-900">{fmt(data.comparison.current.avgDailySales)}원</td>
                      <td className="p-3 bg-slate-50/50"><ComparisonCell current={data.comparison.current.avgDailySales} base={data.comparison.prev.avgDailySales} /></td>
                      <td className="p-3"><ComparisonCell current={data.comparison.current.avgDailySales} base={data.comparison.lastYear.avgDailySales} /></td>
                    </tr>
                    <tr>
                      <td className="p-3 text-left font-semibold text-slate-700">객단가</td>
                      <td className="p-3 font-bold text-slate-900">{fmt(data.comparison.current.avgSpend)}원</td>
                      <td className="p-3 bg-slate-50/50"><ComparisonCell current={data.comparison.current.avgSpend} base={data.comparison.prev.avgSpend} /></td>
                      <td className="p-3"><ComparisonCell current={data.comparison.current.avgSpend} base={data.comparison.lastYear.avgSpend} /></td>
                    </tr>
                    <tr>
                      <td className="p-3 text-left font-semibold text-slate-700">영업일수</td>
                      <td className="p-3 font-bold text-slate-900">{data.comparison.current.openDays}일</td>
                      <td className="p-3 bg-slate-50/50"><ComparisonCell current={data.comparison.current.openDays} base={data.comparison.prev.openDays} formatter={(v: number) => String(v)} suffix="일" /></td>
                      <td className="p-3"><ComparisonCell current={data.comparison.current.openDays} base={data.comparison.lastYear.openDays} formatter={(v: number) => String(v)} suffix="일" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* BEP Summary */}
        <section>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">손익분기점 분석</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">고정비 합계</span>
              <span className="font-semibold text-slate-800">{fmt(data.bep.fixedCostsSum)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">평균 변동비율</span>
              <span className="font-semibold text-slate-800">{(data.bep.variableCostRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
              <span className="font-bold text-slate-900">손익분기점 (BEP)</span>
              <span className="font-bold text-slate-900">{fmt(data.bep.bep)}원</span>
            </div>
            <div className="flex justify-between text-sm mt-4">
              <span className="text-slate-500">현재 월매출</span>
              <span className="font-semibold text-slate-800">{fmt(data.bep.currentRevenue)}원</span>
            </div>
            <div className={`flex justify-between text-sm ${data.bep.bepShortfall > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              <span className="font-bold">{data.bep.bepShortfall > 0 ? '부족액' : '초과액'}</span>
              <span className="font-bold">{data.bep.bepShortfall > 0 ? '-' : '+'}{fmt(Math.abs(data.bep.bepShortfall))}원</span>
            </div>

            {/* BEP AI Diagnosis */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
              <h3 className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1">
                <span>💡</span> AI 진단
              </h3>
              <div className="text-amber-900 font-medium text-sm leading-relaxed prose prose-sm prose-amber max-w-none prose-p:my-1 prose-headings:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.bep.aiDiagnosis}</ReactMarkdown>
              </div>
            </div>
          </div>
        </section>

        {/* Weather Correlation */}
        {data.weather?.stats?.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">날씨별 평균 매출</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {data.weather.stats.map((w: any) => (
                <div key={w.condition} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                  <div className="text-2xl mb-1">{WEATHER_EMOJI[w.condition] || '☁️'}</div>
                  <div className="text-sm font-bold text-slate-800">{w.condition}</div>
                  <div className="text-xs text-slate-500 mb-2">{w.days}일</div>
                  <div className="text-sm font-semibold text-slate-900">{fmt(w.avgRevenue)}원</div>
                </div>
              ))}
            </div>
            
            {data.weather.aiDiagnosis && (
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                <h3 className="text-xs font-bold text-sky-800 mb-2 flex items-center gap-1">
                  <span>💡</span> 날씨 AI 진단
                </h3>
                <div className="text-sky-900 font-medium text-sm leading-relaxed prose prose-sm prose-sky max-w-none prose-p:my-1 prose-headings:my-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.weather.aiDiagnosis}</ReactMarkdown>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Top 10 Menus & Top 5 Vendors */}
        <div className="grid grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-bold mb-3 border-l-4 border-slate-800 pl-2">매출 TOP 10 메뉴</h2>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              {data.topMenus.map((m: any, i: number) => (
                <div key={m.name} className="flex justify-between text-sm items-center">
                  <span className="text-slate-600 truncate mr-2"><span className="text-slate-400 mr-1">{i+1}.</span>{m.name}</span>
                  <span className="font-semibold shrink-0">{fmt(m.amount)}원</span>
                </div>
              ))}
              {data.topMenus.length === 0 && <p className="text-sm text-slate-400">데이터 없음</p>}
            </div>
          </section>
          
          <section>
            <h2 className="text-lg font-bold mb-3 border-l-4 border-slate-800 pl-2">매입처 TOP 5</h2>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              {data.topVendors.map((v: any, i: number) => (
                <div key={v.name} className="flex justify-between text-sm items-center">
                  <span className="text-slate-600 truncate mr-2"><span className="text-slate-400 mr-1">{i+1}.</span>{v.name}</span>
                  <span className="font-semibold shrink-0 text-rose-600">{fmt(v.amount)}원</span>
                </div>
              ))}
              {data.topVendors.length === 0 && <p className="text-sm text-slate-400">데이터 없음</p>}
            </div>
          </section>
        </div>

        {/* Day of Week */}
        <section>
          <h2 className="text-lg font-bold mb-3 border-l-4 border-slate-800 pl-2">요일별 평균 매출</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between">
            {['일', '월', '화', '수', '목', '금', '토'].map((dow, idx) => (
              <div key={dow} className="text-center">
                <p className="text-xs font-semibold text-slate-500 mb-1">{dow}</p>
                <p className="text-sm font-bold text-slate-800">{fmtMan(data.dowAverages[idx])}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Next Month Prediction */}
        {data.prediction && (
          <section>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">
              📈 다음달 예측 ({data.prediction.nextMonth}월)
            </h2>
            
            {!data.prediction.hasEnoughData && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-medium mb-4 flex gap-2">
                <span>⚠️</span>
                <span>데이터가 쌓일수록 예측 정확도가 높아집니다. (현재 6개월 미만)</span>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="mb-6">
                <h3 className="text-sm font-bold text-slate-500 mb-1">매출 예측 범위</h3>
                <div className="text-2xl font-bold text-indigo-600">
                  {fmt(data.prediction.predictedMin)}원 ~ {fmt(data.prediction.predictedMax)}원
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1">
                    <span>🔍</span> 예측 근거
                  </h3>
                  <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
                    <li>{data.prediction.predictionBasis}</li>
                    <li>계절/날씨: {data.prediction.seasonality || '특이사항 없음'}</li>
                    <li>주말/공휴일: 주말 {data.prediction.weekendCount}일 {data.prediction.holidays.length > 0 ? `, ${data.prediction.holidays.join(', ')} 포함` : ''}</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1">
                    <span>📦</span> 발주 권장 (현재 원가율 기준)
                  </h3>
                  <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
                    <li>주류: {fmtMan(data.prediction.recommendedAlcohol)}원 수준 권장</li>
                    <li>식자재: {fmtMan(data.prediction.recommendedFood)}원 수준 권장</li>
                  </ul>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1">
                  <span>💡</span> 기본 운영 제안
                </h3>
                <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
                  <li>주말 집중 영업 및 프로모션 권장</li>
                  <li>평일 유휴 시간대 비용 절감 검토</li>
                </ul>
              </div>

              {data.prediction.aiDiagnosis && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-indigo-800 mb-2 flex items-center gap-1">
                    <span>🤖</span> AI 종합 예측 및 준비사항
                  </h3>
                  <div className="text-indigo-900 font-medium text-sm leading-relaxed prose prose-sm prose-indigo max-w-none prose-p:my-1 prose-headings:my-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.prediction.aiDiagnosis}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center pt-8 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            마지막 업데이트: {new Date(data.generatedAt).toLocaleString('ko-KR')} <br/>
            데이터 추가/수정 후 재생성 가능합니다.
          </p>
        </footer>

      </main>
    </div>
  );
}

export default function MonthlyReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 animate-pulse">보고서 준비 중...</div>}>
      <MonthlyReportContent />
    </Suspense>
  );
}
