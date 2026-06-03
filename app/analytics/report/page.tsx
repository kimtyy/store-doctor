'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function MonthlyReportPage() {
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

    csv += `[AI 진단]\n`;
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
          <p className="text-slate-800 font-medium leading-relaxed">
            {data.aiDiagnosis}
          </p>
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
