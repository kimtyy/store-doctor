'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DailySales, SalesMenuItem } from '../../types/sales';
import { correctMenuName, MenuMasterEntry } from '../../lib/menuCorrection';
import CameraModal from '../../components/ui/CameraModal';
import { compressImage } from '../../lib/compressImage';
import BottomTabNav from '../../components/BottomTabNav';
import PeriodSelector, { PeriodValue, MonthSelection } from '../../components/PeriodSelector';

type Tab = 'input' | 'history';
type ParseMode = 'full' | 'menu_only' | 'manual';

type EditableReceipt = Partial<DailySales> & {
  date: string;
  totalRevenue: number;
  netRevenue: number;
  cashAmount: number;
  cardAmount: number;
};

interface SalesMenuItemWithMeta extends SalesMenuItem {
  _originalName?: string;
  _correctionStatus?: 'exact' | 'auto' | 'suggest' | 'none';
  _suggestedName?: string;
  _suggestionAccepted?: boolean;
}

function fixYear(dateStr: string): string {
  const currentYear = new Date().getFullYear().toString();
  const m = dateStr.match(/^(\d{4})/);
  if (m && m[1] !== currentYear) return dateStr.replace(/^\d{4}/, currentYear);
  return dateStr;
}

function stripMeta(items: SalesMenuItemWithMeta[]): SalesMenuItem[] {
  return items.map(({ _originalName: _a, _correctionStatus: _b, _suggestedName: _c, _suggestionAccepted: _d, ...item }) => item);
}

async function applyCorrections(items: SalesMenuItemWithMeta[]): Promise<SalesMenuItemWithMeta[]> {
  try {
    const res = await fetch('/api/menu-master');
    if (!res.ok) return items;
    const body = await res.json();
    const masters: MenuMasterEntry[] = (body.data ?? []).map(
      (r: { menu_name: string; aliases: string[] | null; category: string | null }) => ({
        menuName: r.menu_name,
        aliases: r.aliases ?? [],
        category: r.category,
      })
    );
    if (masters.length === 0) return items;
    return items.map((item) => {
      const result = correctMenuName(item.name, masters);
      if (result.status === 'none') return item;
      const patch: Partial<SalesMenuItemWithMeta> = {
        name: result.correctedName,
        _originalName: result.originalName,
        _correctionStatus: result.status,
        _suggestedName: result.suggestedName,
      };
      // Apply category from master for confirmed corrections
      if ((result.status === 'exact' || result.status === 'auto') && result.category) {
        patch.category = result.category;
      }
      return { ...item, ...patch };
    });
  } catch {
    return items;
  }
}

interface HistoryDraft {
  date: string;
  totalRevenue: number;
  serviceAmount: number;
  netRevenue: number;
  tax: number;
  cashAmount: number;
  cardAmount: number;
  guestCount: number;
  avgSpend: number;
  menuItems: SalesMenuItem[];
}

const iCls = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100';
const iClsDark = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100';

interface MenuItemsEditorProps {
  items: SalesMenuItemWithMeta[];
  onUpdate: (index: number, patch: Partial<SalesMenuItemWithMeta>) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
}

function MenuItemsEditor({ items, onUpdate, onDelete, onAdd }: MenuItemsEditorProps) {
  const [showOriginal, setShowOriginal] = useState<number | null>(null);

  return (
    <div className="rounded-2xl bg-slate-950/80 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">메뉴 ({items.length}개)</p>
        <button type="button" onClick={onAdd} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600">+ 추가</button>
      </div>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {items.map((item, index) => {
          const isAutoCorrected =
            (item._correctionStatus === 'auto' || item._correctionStatus === 'exact') &&
            item._originalName &&
            item._originalName !== item.name;
          const isSuggesting =
            item._correctionStatus === 'suggest' &&
            item._suggestionAccepted !== true &&
            item._suggestionAccepted !== false;

          return (
            <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-slate-500">{index + 1}</p>
                <button type="button" onClick={() => onDelete(index)} className="text-xs text-rose-400 hover:text-rose-300">삭제</button>
              </div>
              <input type="text" value={item.name} onChange={(e) => onUpdate(index, { name: e.target.value, _correctionStatus: 'none' })} placeholder="메뉴명" className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100 mb-1.5" />
              {isAutoCorrected && (
                <div className="flex items-center gap-2 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setShowOriginal(showOriginal === index ? null : index)}
                    className="text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full"
                  >
                    자동교정
                  </button>
                  {showOriginal === index && (
                    <span className="text-xs text-slate-500">원본: {item._originalName}</span>
                  )}
                </div>
              )}
              {isSuggesting && (
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                    제안: {item._suggestedName}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdate(index, { name: item._suggestedName!, _originalName: item.name, _correctionStatus: 'auto', _suggestionAccepted: true })}
                    className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full hover:bg-emerald-500/30"
                  >
                    ✓ 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate(index, { _correctionStatus: 'none', _suggestionAccepted: false })}
                    className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full hover:bg-slate-600"
                  >
                    ✗ 무시
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-slate-500 mb-1">수량</p>
                  <input type="number" min={1} value={item.quantity} onChange={(e) => onUpdate(index, { quantity: Number(e.target.value) })} onFocus={(e) => e.target.select()} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">금액</p>
                  <input type="number" value={item.amount} onChange={(e) => onUpdate(index, { amount: Number(e.target.value) })} onFocus={(e) => e.target.select()} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800 flex justify-between items-center">
        <p className="text-xs text-slate-400">합계</p>
        <p className="font-bold text-emerald-400">{items.reduce((s, i) => s + i.amount, 0).toLocaleString()}원</p>
      </div>
    </div>
  );
}

export default function SalesInputPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('input');
  const [parseMode, setParseMode] = useState<ParseMode>('full');

  // role 체크: staff는 본인 입력 글만 수정 가능
  const [role, setRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/me/role')
      .then((r) => r.json())
      .then((d) => {
        setRole(d.role ?? null);
        setCurrentUserId(d.userId ?? null);
      })
      .catch(() => {
        setRole(null);
        setCurrentUserId(null);
      });
  }, []);

  // input state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [menuFile, setMenuFile] = useState<File | null>(null);
  const [editableReceipt, setEditableReceipt] = useState<EditableReceipt | null>(null);
  const [editableMenuItems, setEditableMenuItems] = useState<SalesMenuItemWithMeta[]>([]);
  const [menuParsed, setMenuParsed] = useState(false);
  const [menuDate, setMenuDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualRecord, setManualRecord] = useState<EditableReceipt>({
    date: new Date().toISOString().split('T')[0],
    totalRevenue: 0,
    netRevenue: 0,
    cashAmount: 0,
    cardAmount: 0,
    serviceAmount: 0,
    guestCount: 0,
    note: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [receiptCameraOpen, setReceiptCameraOpen] = useState(false);
  const [menuCameraOpen, setMenuCameraOpen] = useState(false);
  // step-save state (full mode)
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [savingMenuItems, setSavingMenuItems] = useState(false);
  const [savedSalesId, setSavedSalesId] = useState<string | null>(null);
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [menuSaved, setMenuSaved] = useState(false);
  const [isEventSales, setIsEventSales] = useState(false);

  // instant save feedback states
  const [showReceiptSaveSuccess, setShowReceiptSaveSuccess] = useState(false);
  const [showMenuSaveSuccess, setShowMenuSaveSuccess] = useState(false);
  const [showOnlyMenuSaveSuccess, setShowOnlyMenuSaveSuccess] = useState(false);

  const handleReceiptFileChange = (file: File | null) => {
    setReceiptFile(file);
    setEditableReceipt(null);
  };

  const handleMenuFileChange = (file: File | null) => {
    setMenuFile(file);
    setMenuParsed(false);
    setEditableMenuItems([]);
  };

  const handleNextDayInput = () => {
    if (!editableReceipt?.date) return;
    const currentDate = new Date(editableReceipt.date);
    currentDate.setDate(currentDate.getDate() + 1);
    const nextDateStr = currentDate.toISOString().split('T')[0];

    resetInput();
    setManualRecord((prev) => ({ ...prev, date: nextDateStr }));
    setMenuDate(nextDateStr);
  };

  // history state
  const [historyData, setHistoryData] = useState<DailySales[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, HistoryDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [historyMsg, setHistoryMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [historyPeriodValue, setHistoryPeriodValue] = useState<PeriodValue>(() => ({
    type: '30',
    selectedMonth: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    },
  }));
  const [availableMonths, setAvailableMonths] = useState<MonthSelection[]>([]);

  useEffect(() => {
    if (tab === 'history') {
      fetch('/api/analytics/months')
        .then((r) => r.json())
        .then((d) => {
          if (d.months) setAvailableMonths(d.months);
        })
        .catch(() => {});
    }
  }, [tab]);

  const filteredSalesHistory = useMemo(() => {
    let list = historyData.filter((r) => !r.isEvent);

    if (historyPeriodValue.type === '7') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      list = list.filter((r) => r.date >= cutoffStr);
    } else if (historyPeriodValue.type === '30') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      list = list.filter((r) => r.date >= cutoffStr);
    } else if (historyPeriodValue.type === 'monthly' && historyPeriodValue.selectedMonth) {
      const { year, month } = historyPeriodValue.selectedMonth;
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      list = list.filter((r) => r.date.startsWith(ym));
    } else if (historyPeriodValue.type === 'custom' && historyPeriodValue.customRange) {
      const { startDate, endDate } = historyPeriodValue.customRange;
      list = list.filter((r) => r.date >= startDate && r.date <= endDate);
    }

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [historyData, historyPeriodValue]);

  const historySumRevenue = useMemo(
    () => filteredSalesHistory.reduce((s, r) => s + r.netRevenue, 0),
    [filteredSalesHistory]
  );

  // ── history ──────────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/sales');
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? '불러오기 실패');
      setHistoryData([...(body.data ?? [])].reverse());
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '불러오기 실패');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  function toggleExpand(record: DailySales) {
    if (!record.id!) return;
    const id = record.id!;
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!drafts[id]) {
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          date: record.date,
          totalRevenue: record.totalRevenue,
          serviceAmount: record.serviceAmount ?? 0,
          netRevenue: record.netRevenue,
          tax: record.tax ?? 0,
          cashAmount: record.cashAmount ?? 0,
          cardAmount: record.cardAmount ?? 0,
          guestCount: record.guestCount ?? 0,
          avgSpend: record.avgSpend ?? 0,
          menuItems: record.menuItems ? [...record.menuItems] : [],
        },
      }));
    }
  }

  function patchDraft(id: string, patch: Partial<Omit<HistoryDraft, 'menuItems'>>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function updateDraftItem(id: string, idx: number, patch: Partial<SalesMenuItem>) {
    setDrafts((prev) => {
      const items = [...prev[id].menuItems];
      items[idx] = { ...items[idx], ...patch };
      return { ...prev, [id]: { ...prev[id], menuItems: items } };
    });
  }

  function deleteDraftItem(id: string, idx: number) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], menuItems: prev[id].menuItems.filter((_, i) => i !== idx) },
    }));
  }

  function addDraftItem(id: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], menuItems: [...prev[id].menuItems, { name: '', quantity: 1, amount: 0 }] },
    }));
  }

  async function saveHistoryDraft(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setHistoryMsg(null);
    try {
      const res = await fetch('/api/sales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, receipt: draft, menuItems: draft.menuItems }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? '저장 실패');
      setHistoryMsg({ type: 'success', text: '✅ 수정 저장 완료' });
      await loadHistory();
      setExpandedId(null);
    } catch (err) {
      setHistoryMsg({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' });
    } finally {
      setSavingId(null);
    }
  }

  function handleAddMenuMode(record: DailySales) {
    setEditableReceipt({
      date: record.date,
      totalRevenue: record.totalRevenue,
      netRevenue: record.netRevenue,
      cashAmount: record.cashAmount ?? 0,
      cardAmount: record.cardAmount ?? 0,
      serviceAmount: record.serviceAmount ?? 0,
      guestCount: record.guestCount ?? 0,
      tax: record.tax ?? 0,
      discount: record.discount ?? 0,
      actualSales: record.actualSales ?? record.totalRevenue,
    });
    setReceiptSaved(true);
    setMenuSaved(false);
    setMenuParsed(false);
    setEditableMenuItems([]);
    setParseMode('full');
    setTab('input');
    window.scrollTo(0, 0);
  }

  // ── input ─────────────────────────────────────────────────────────────────────

  async function saveCorrectionsAsAliases(items: SalesMenuItemWithMeta[]) {
    const pairs = items.filter(
      (item) =>
        (item._correctionStatus === 'auto' || item._correctionStatus === 'exact') &&
        item._originalName &&
        item._originalName !== item.name
    );
    if (pairs.length === 0) return;
    await Promise.allSettled(
      pairs.map((item) =>
        fetch('/api/menu-master', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ menuName: item.name, alias: item._originalName }),
        })
      )
    );
  }

  function updateMenuItem(index: number, value: Partial<SalesMenuItemWithMeta>) {
    setEditableMenuItems((cur) => { const a = [...cur]; a[index] = { ...a[index], ...value }; return a; });
  }
  function addMenuItem() { setEditableMenuItems((cur) => [...cur, { name: '', quantity: 1, amount: 0 }]); }
  function deleteMenuItem(index: number) { setEditableMenuItems((cur) => cur.filter((_, i) => i !== index)); }

  async function handleReceiptParse() {
    if (!receiptFile) { setError('POS 마감 정산서 사진을 선택해주세요.'); return; }
    setError(null); setLoadingReceipt(true);
    try {
      const dataUrl = await compressImage(receiptFile);
      const res = await fetch('/api/parse/pos-receipt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [dataUrl] }),
      });
      const text = await res.text();
      if (!text?.trim()) throw new Error('서버로부터 빈 응답을 받았습니다. 잠시 후 다시 시도해주세요.');
      let body;
      try { body = JSON.parse(text); } catch { throw new Error('서버 응답을 처리할 수 없습니다. 다시 시도해주세요.'); }
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      if (!body.data) throw new Error('파싱 결과를 받지 못했습니다. 다른 사진으로 시도해주세요.');
      const p = body.data as DailySales;
      const rawDate = p.date ?? new Date().toISOString().split('T')[0];
      setEditableReceipt({
        date: fixYear(rawDate),
        totalRevenue: p.totalRevenue ?? 0, discount: p.discount ?? 0,
        serviceCharge: p.serviceCharge ?? 0,
        serviceAmount: p.serviceAmount ?? p.serviceCharge ?? 0,
        actualSales: p.actualSales ?? ((p.totalRevenue ?? 0) - (p.serviceAmount ?? p.serviceCharge ?? 0)),
        tax: p.tax ?? 0, netRevenue: p.netRevenue ?? 0,
        cashCount: p.cashCount ?? 0, cashAmount: p.cashAmount ?? 0,
        cardCount: p.cardCount ?? 0, cardAmount: p.cardAmount ?? 0,
        tablesUsed: p.tablesUsed ?? 0, guestCount: p.guestCount ?? 0, avgSpend: p.avgSpend ?? 0,
        openTime: p.openTime ?? '', closeTime: p.closeTime ?? '', firstOrderTime: p.firstOrderTime ?? '',
      });
    } catch (err) { setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'); }
    finally { setLoadingReceipt(false); }
  }

  async function handleMenuParse() {
    if (!menuFile) { setError('메뉴별 매출 내역 사진을 선택해주세요.'); return; }
    setError(null); setLoadingMenu(true);
    try {
      const dataUrl = await compressImage(menuFile);
      const res = await fetch('/api/parse/menu-sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [dataUrl] }),
      });
      const text = await res.text();
      if (!text?.trim()) throw new Error('서버로부터 빈 응답을 받았습니다. 잠시 후 다시 시도해주세요.');
      let body;
      try { body = JSON.parse(text); } catch { throw new Error('서버 응답을 처리할 수 없습니다. 다시 시도해주세요.'); }
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      if (!body.data) throw new Error('파싱 결과를 받지 못했습니다. 다른 사진으로 시도해주세요.');
      const rawItems: SalesMenuItemWithMeta[] = body.data.menuItems ?? [];
      const corrected = await applyCorrections(rawItems);
      setEditableMenuItems(corrected);
      setMenuParsed(true);
      if (parseMode === 'menu_only') {
        const menuSum = rawItems.reduce((s: number, i: SalesMenuItemWithMeta) => s + i.amount, 0);
        const tax = Math.round(menuSum * 0.091);
        setEditableReceipt({
          date: menuDate, totalRevenue: menuSum, discount: 0,
          serviceCharge: 0, serviceAmount: 0, actualSales: menuSum,
          tax, netRevenue: menuSum - tax,
          cashCount: 0, cashAmount: 0, cardCount: 0, cardAmount: 0,
          tablesUsed: 0, guestCount: 0, avgSpend: 0,
          openTime: '', closeTime: '', firstOrderTime: '',
        });
      }
    } catch (err) { setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'); }
    finally { setLoadingMenu(false); }
  }

  function resetInput() {
    setReceiptFile(null); setMenuFile(null);
    setEditableReceipt(null); setEditableMenuItems([]);
    setMenuParsed(false); setReceiptSaved(false);
    setMenuSaved(false); setSavedSalesId(null);
    setSaveSuccess(null); setError(null);
    setIsEventSales(false);
  }

  async function handleSaveReceipt() {
    if (!editableReceipt) return;
    setError(null); setSavingReceipt(true);
    try {
      const res = await fetch('/api/sales/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt: { ...editableReceipt, isEvent: isEventSales } }),
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { throw new Error('서버 응답 처리 실패'); }
      if (!res.ok) throw new Error(body?.error || body?.details || `서버 오류 (${res.status})`);
      setSavedSalesId(body.data?.salesId ?? null);
      setReceiptSaved(true);
      setShowReceiptSaveSuccess(true);
      setTimeout(() => setShowReceiptSaveSuccess(false), 2000);
      setSaveSuccess('✅ 정산서 저장 완료');
    } catch (err) { setError(err instanceof Error ? err.message : '저장 실패'); }
    finally { setSavingReceipt(false); }
  }

  async function handleSaveMenuItems() {
    if (!editableReceipt?.date) { setError('정산서 날짜가 없습니다.'); return; }
    if (editableMenuItems.length === 0) { setError('저장할 메뉴 항목이 없습니다.'); return; }
    setError(null); setSavingMenuItems(true);
    try {
      const res = await fetch('/api/sales/add-menu', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: editableReceipt.date, menuItems: stripMeta(editableMenuItems) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `서버 오류 (${res.status})`);
      await saveCorrectionsAsAliases(editableMenuItems);
      setMenuSaved(true);
      setShowMenuSaveSuccess(true);
      setTimeout(() => setShowMenuSaveSuccess(false), 2000);
      setSaveSuccess('✅ 오늘 입력 완료!');
    } catch (err) { setError(err instanceof Error ? err.message : '저장 실패'); }
    finally { setSavingMenuItems(false); }
  }

  async function handleSave(successMessage?: string) {
    if (!editableReceipt) { setError('먼저 정산서 또는 메뉴 내역을 파싱해주세요.'); return; }
    setError(null); setSaveSuccess(null); setSaving(true);
    try {
      // menu_only 모드: 메뉴 항목 합산으로 총매출 재계산
      let finalReceipt = editableReceipt;
      if (parseMode === 'menu_only' && editableMenuItems.length > 0) {
        const menuSum = editableMenuItems.reduce((s, i) => s + i.amount, 0);
        const serviceAmt = editableReceipt.serviceAmount ?? 0;
        const tax = Math.round((menuSum - serviceAmt) * 0.091);
        finalReceipt = { ...editableReceipt, totalRevenue: menuSum, actualSales: menuSum - serviceAmt, tax, netRevenue: menuSum - serviceAmt - tax };
      }
      const res = await fetch('/api/sales/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt: { ...finalReceipt, isEvent: isEventSales }, menu: menuParsed ? { menuItems: stripMeta(editableMenuItems) } : undefined }),
      });
      const text = await res.text();
      if (!text?.trim()) throw new Error('서버로부터 빈 응답을 받았습니다. 잠시 후 다시 시도해주세요.');
      let body;
      try { body = JSON.parse(text); } catch { throw new Error('서버 응답을 처리할 수 없습니다. 다시 시도해주세요.'); }
      if (!res.ok) throw new Error(body.error || body.details || `서버 오류 (${res.status})`);
      if (body.success) {
        await saveCorrectionsAsAliases(editableMenuItems);
        setSaveSuccess(successMessage ?? body.message ?? '✅ 저장 완료!');
        setShowOnlyMenuSaveSuccess(true);
        setTimeout(() => {
          setShowOnlyMenuSaveSuccess(false);
          resetInput();
        }, 1500);
      } else throw new Error('저장 결과를 확인할 수 없습니다.');
    } catch (err) { setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  }

  async function handleSaveManual() {
    if (!manualRecord.totalRevenue || manualRecord.totalRevenue <= 0) {
      setError('총매출금액을 입력해주세요.');
      return;
    }
    setError(null); setSaveSuccess(null); setSaving(true);
    try {
      const netRevenue = manualRecord.totalRevenue - (manualRecord.serviceAmount ?? 0);
      const res = await fetch('/api/sales/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: {
            ...manualRecord,
            netRevenue,
            isEvent: isEventSales,
            inputMethod: 'manual',
          },
        }),
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { throw new Error('서버 응답을 처리할 수 없습니다.'); }
      if (!res.ok) throw new Error(body.error || body.details || `서버 오류 (${res.status})`);
      if (body.success) {
        setSaveSuccess('✅ 수동 입력 저장 완료!');
        resetInput();
        setManualRecord({
          date: new Date().toISOString().split('T')[0],
          totalRevenue: 0, netRevenue: 0, cashAmount: 0, cardAmount: 0, serviceAmount: 0, guestCount: 0, note: '',
        });
      } else throw new Error('저장 결과를 확인할 수 없습니다.');
    } catch (err) { setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  }

  const btnBase = 'flex-1 rounded-2xl border border-slate-700 bg-slate-950/80 py-4 text-sm font-medium text-slate-100 hover:bg-slate-900 hover:border-slate-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-center cursor-pointer';

  return (
    <>
      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        <CameraModal isOpen={receiptCameraOpen} onCapture={handleReceiptFileChange} onClose={() => setReceiptCameraOpen(false)} galleryInputId="receipt-gallery-input" />
        <CameraModal isOpen={menuCameraOpen} onCapture={handleMenuFileChange} onClose={() => setMenuCameraOpen(false)} galleryInputId="menu-gallery-input" />
        <input id="receipt-gallery-input" type="file" accept="image/*" className="hidden" onChange={(e) => handleReceiptFileChange(e.target.files?.[0] ?? null)} />
        <input id="menu-gallery-input" type="file" accept="image/*" className="hidden" onChange={(e) => handleMenuFileChange(e.target.files?.[0] ?? null)} />

        <div className="max-w-2xl space-y-6">
          <h1 className="text-3xl font-bold">매출</h1>

          {/* Main tabs */}
          <div className="flex gap-1 rounded-2xl bg-slate-900/80 p-1.5">
            {(['input', 'history'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${tab === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {t === 'input' ? '📷 입력' : '📋 내역'}
              </button>
            ))}
          </div>

          {/* ── INPUT TAB ─────────────────────────────────────────────────────── */}
          {tab === 'input' && (
            <>
              {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
              {saveSuccess && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{saveSuccess}</div>}

              {/* Parse mode selector */}
              <div className="flex gap-1 rounded-2xl bg-slate-900/60 p-1.5 border border-slate-800">
                {(['full', 'menu_only', 'manual'] as ParseMode[]).map((m) => (
                  <button key={m}
                    onClick={() => { setParseMode(m); setEditableReceipt(null); setEditableMenuItems([]); setMenuParsed(false); }}
                    className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${parseMode === m ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>
                    {m === 'full' ? '정산서 + 메뉴' : m === 'menu_only' ? '메뉴만' : '✏️ 수동 입력'}
                  </button>
                ))}
              </div>

              {/* ── FULL MODE ──────────────────────────────────────────────────── */}
              {parseMode === 'full' && (
                <>
                  {/* 완료 상태 */}
                  {receiptSaved && menuSaved ? (
                    <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-4">
                      <p className="text-4xl">🎉</p>
                      <p className="text-xl font-bold text-emerald-300">오늘 입력 완료!</p>
                      <p className="text-sm text-slate-400">
                        {editableReceipt?.date} 매출 · 메뉴 {editableMenuItems.length}개
                      </p>
                      <div className="flex gap-3 justify-center mt-4">
                        <button type="button" onClick={handleNextDayInput}
                          className="flex-1 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 active:scale-[0.98] transition">
                          다음 날짜 입력
                        </button>
                        <button type="button" onClick={() => router.push('/dashboard')}
                          className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3.5 text-sm font-semibold text-slate-100 hover:bg-slate-800 active:scale-[0.98] transition">
                          완료
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* ① POS 마감 정산서 */}
                      <div className={`rounded-3xl border bg-slate-900/90 p-6 space-y-4 ${receiptSaved ? 'border-emerald-600/40' : 'border-slate-800'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-semibold">① POS 마감 정산서</h2>
                            <p className="mt-1 text-xs text-slate-400">총매출, 현금/카드 구분 내용</p>
                          </div>
                          {receiptSaved && <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">✅ 저장됨</span>}
                        </div>

                        {!receiptSaved && (
                          <>
                            <div className="flex gap-3">
                              <button type="button" onClick={() => setReceiptCameraOpen(true)} className={btnBase}>
                                <span>📷</span>
                                <span>사진 촬영</span>
                              </button>
                              <label htmlFor="receipt-gallery-input" className={btnBase}>
                                <span>🖼️</span>
                                <span>갤러리에서 선택</span>
                              </label>
                            </div>
                            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-400 leading-relaxed flex items-start gap-2">
                              <span className="shrink-0 text-slate-400">💡</span>
                              <span>
                                📄 긴 영수증은 폰 카메라의 <strong className="font-medium text-slate-300">&apos;문서 스캔&apos;</strong> 기능으로 저장해서 올리면 인식률이 크게 높아집니다.
                              </span>
                            </div>
                            {receiptFile && <p className="text-xs text-slate-400 truncate">선택됨: {receiptFile.name}</p>}
                            <button type="button" onClick={handleReceiptParse} disabled={loadingReceipt || !receiptFile || !!editableReceipt}
                              className={`w-full rounded-2xl px-6 py-4 text-base font-semibold transition disabled:cursor-not-allowed ${
                                editableReceipt
                                  ? 'bg-slate-700 text-slate-400 opacity-80'
                                  : 'bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-50'
                              }`}>
                              {loadingReceipt ? '파싱 중...' : editableReceipt ? '✓ 파싱 완료' : '정산서 파싱 (누르세요)'}
                            </button>
                          </>
                        )}

                        {editableReceipt && (
                          <>
                            <div className="rounded-2xl bg-slate-950/80 p-5 space-y-4">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                {receiptSaved ? '저장된 정산서' : '정산서 결과 — 수정 가능'}
                              </p>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2"><label className="text-xs text-slate-400">날짜</label><input type="date" value={editableReceipt.date} disabled={receiptSaved} onChange={(e) => setEditableReceipt((c) => c ? { ...c, date: e.target.value } : c)} className={iCls} /></div>
                                <div><label className="text-xs text-slate-400">총매출</label><input type="number" value={editableReceipt.totalRevenue} disabled={receiptSaved} onChange={(e) => setEditableReceipt((c) => c ? { ...c, totalRevenue: Number(e.target.value) } : c)} className={iCls} /></div>
                                <div><label className="text-xs text-slate-400">서비스금액</label><input type="number" value={editableReceipt.serviceAmount ?? 0} disabled={receiptSaved} onChange={(e) => setEditableReceipt((c) => c ? { ...c, serviceAmount: Number(e.target.value) } : c)} className={iCls} /></div>
                                <div><label className="text-xs text-slate-400">순매출</label><input type="number" value={editableReceipt.netRevenue} disabled={receiptSaved} onChange={(e) => setEditableReceipt((c) => c ? { ...c, netRevenue: Number(e.target.value) } : c)} className={iCls} /></div>
                                <div><label className="text-xs text-slate-400">현금</label><input type="number" value={editableReceipt.cashAmount} disabled={receiptSaved} onChange={(e) => setEditableReceipt((c) => c ? { ...c, cashAmount: Number(e.target.value) } : c)} className={iCls} /></div>
                                <div><label className="text-xs text-slate-400">카드</label><input type="number" value={editableReceipt.cardAmount} disabled={receiptSaved} onChange={(e) => setEditableReceipt((c) => c ? { ...c, cardAmount: Number(e.target.value) } : c)} className={iCls} /></div>
                                <div><label className="text-xs text-slate-400">고객수</label><input type="number" value={editableReceipt.guestCount ?? 0} disabled={receiptSaved} onChange={(e) => setEditableReceipt((c) => c ? { ...c, guestCount: Number(e.target.value) } : c)} className={iCls} /></div>
                                <div><label className="text-xs text-slate-400">부가세</label><input type="number" value={editableReceipt.tax ?? 0} disabled={receiptSaved} onChange={(e) => setEditableReceipt((c) => c ? { ...c, tax: Number(e.target.value) } : c)} className={iCls} /></div>
                              </div>
                            </div>

                            {!receiptSaved && (
                              <>
                                {/* 행사 매출 토글 */}
                                <button
                                  type="button"
                                  onClick={() => setIsEventSales((v) => !v)}
                                  className={`flex items-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium transition ${
                                    isEventSales
                                      ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                                      : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span className="text-lg">🎪</span>
                                  <span>행사 매출</span>
                                  <span className={`ml-auto text-xs font-bold ${isEventSales ? 'text-purple-300' : 'text-slate-600'}`}>
                                    {isEventSales ? 'ON' : 'OFF'}
                                  </span>
                                  <span className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                                    isEventSales ? 'bg-purple-500' : 'bg-slate-700'
                                  }`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                                      isEventSales ? 'left-5' : 'left-0.5'
                                    }`} />
                                  </span>
                                </button>
                                {showReceiptSaveSuccess && (
                                   <div className="text-center text-sm font-semibold text-emerald-400 animate-pulse mb-2">저장 완료 ✓</div>
                                 )}
                                 <button type="button" onClick={handleSaveReceipt} disabled={savingReceipt}
                                  className="w-full rounded-2xl bg-sky-500 px-6 py-4 text-base font-bold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">
                                  {savingReceipt ? '저장 중...' : '정산서 저장'}
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      {/* ② 메뉴별 매출 */}
                      <div className={`rounded-3xl border bg-slate-900/90 p-6 space-y-4 ${menuSaved ? 'border-emerald-600/40' : 'border-slate-800'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-semibold">② 메뉴별 매출 내역</h2>
                            <p className="mt-1 text-xs text-slate-400">메뉴명, 수량, 금액 (선택)</p>
                          </div>
                          {menuSaved && <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">✅ 저장됨</span>}
                        </div>

                        {!menuSaved && (
                          <>
                            <div className="flex gap-3">
                              <button type="button" onClick={() => setMenuCameraOpen(true)} className={btnBase}>
                                <span>📷</span>
                                <span>사진 촬영</span>
                              </button>
                              <label htmlFor="menu-gallery-input" className={btnBase}>
                                <span>🖼️</span>
                                <span>갤러리에서 선택</span>
                              </label>
                            </div>
                            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-400 leading-relaxed flex items-start gap-2">
                              <span className="shrink-0 text-slate-400">💡</span>
                              <span>
                                📄 긴 영수증은 폰 카메라의 <strong className="font-medium text-slate-300">&apos;문서 스캔&apos;</strong> 기능으로 저장해서 올리면 인식률이 크게 높아집니다.
                              </span>
                            </div>
                            {menuFile && <p className="text-xs text-slate-400 truncate">선택됨: {menuFile.name}</p>}
                            <button type="button" onClick={handleMenuParse} disabled={loadingMenu || !menuFile || menuParsed}
                              className={`w-full rounded-2xl px-6 py-4 text-base font-semibold transition disabled:cursor-not-allowed ${
                                menuParsed
                                  ? 'bg-slate-700 text-slate-400 opacity-80'
                                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50'
                              }`}>
                              {loadingMenu ? '파싱 중...' : menuParsed ? '✓ 파싱 완료' : '메뉴 매출 파싱 (누르세요)'}
                            </button>
                          </>
                        )}

                        {menuParsed && !menuSaved && (
                          <>
                            <MenuItemsEditor items={editableMenuItems} onUpdate={updateMenuItem} onDelete={deleteMenuItem} onAdd={addMenuItem} />
                            {!receiptSaved ? (
                              <p className="text-center text-xs text-amber-400">먼저 ① 정산서를 저장해주세요</p>
                            ) : (
                              <>
                                {showMenuSaveSuccess && (
                                  <div className="text-center text-sm font-semibold text-emerald-400 animate-pulse mb-2">저장 완료 ✓</div>
                                )}
                                <button type="button" onClick={handleSaveMenuItems} disabled={savingMenuItems}
                                  className="w-full rounded-2xl bg-emerald-500 px-6 py-4 text-base font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
                                  {savingMenuItems ? '저장 중...' : `메뉴 저장 (${editableMenuItems.length}개)`}
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── MENU_ONLY MODE ─────────────────────────────────────────────── */}
              {parseMode === 'menu_only' && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">메뉴별 매출 내역</h2>
                    <p className="mt-1 text-xs text-slate-400">정산서 없이 메뉴 내역 사진만으로 입력합니다</p>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setMenuCameraOpen(true)} className={btnBase}>
                      <span>📷</span>
                      <span>사진 촬영</span>
                    </button>
                    <label htmlFor="menu-gallery-input" className={btnBase}>
                      <span>🖼️</span>
                      <span>갤러리에서 선택</span>
                    </label>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-400 leading-relaxed flex items-start gap-2">
                    <span className="shrink-0 text-slate-400">💡</span>
                    <span>
                      📄 긴 영수증은 폰 카메라의 <strong className="font-medium text-slate-300">&apos;문서 스캔&apos;</strong> 기능으로 저장해서 올리면 인식률이 크게 높아집니다.
                    </span>
                  </div>
                  {menuFile && <p className="text-xs text-slate-400 truncate">선택됨: {menuFile.name}</p>}
                  <button type="button" onClick={handleMenuParse} disabled={loadingMenu || !menuFile || menuParsed}
                    className={`w-full rounded-2xl px-6 py-4 text-base font-semibold transition disabled:cursor-not-allowed ${
                      menuParsed
                        ? 'bg-slate-700 text-slate-400 opacity-80'
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50'
                    }`}>
                    {loadingMenu ? '파싱 중...' : menuParsed ? '✓ 파싱 완료' : '메뉴 파싱 (누르세요)'}
                  </button>

                  {menuParsed && editableReceipt && (
                    <>
                      <MenuItemsEditor items={editableMenuItems} onUpdate={updateMenuItem} onDelete={deleteMenuItem} onAdd={addMenuItem} />

                      <div className="rounded-2xl bg-slate-950/80 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">추가 정보 입력</p>
                          <span className="text-xs text-sky-400 font-semibold">총매출 {editableMenuItems.reduce((s, i) => s + i.amount, 0).toLocaleString()}원 (자동)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2"><label className="text-xs text-slate-400">날짜</label><input type="date" value={editableReceipt.date} onChange={(e) => setEditableReceipt((c) => c ? { ...c, date: e.target.value } : c)} className={iCls} /></div>
                          <div><label className="text-xs text-slate-400">서비스금액</label><input type="number" value={editableReceipt.serviceAmount ?? 0} onChange={(e) => setEditableReceipt((c) => c ? { ...c, serviceAmount: Number(e.target.value) } : c)} className={iCls} /></div>
                          <div><label className="text-xs text-slate-400">현금</label><input type="number" value={editableReceipt.cashAmount} onChange={(e) => setEditableReceipt((c) => c ? { ...c, cashAmount: Number(e.target.value) } : c)} className={iCls} /></div>
                          <div><label className="text-xs text-slate-400">카드</label><input type="number" value={editableReceipt.cardAmount} onChange={(e) => setEditableReceipt((c) => c ? { ...c, cardAmount: Number(e.target.value) } : c)} className={iCls} /></div>
                          <div><label className="text-xs text-slate-400">고객수</label><input type="number" value={editableReceipt.guestCount ?? 0} onChange={(e) => setEditableReceipt((c) => c ? { ...c, guestCount: Number(e.target.value) } : c)} className={iCls} /></div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEventSales((v) => !v)}
                        className={`flex items-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium transition ${
                          isEventSales
                            ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                            : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="text-lg">🎪</span>
                        <span>행사 매출</span>
                        <span className={`ml-auto text-xs font-bold ${isEventSales ? 'text-purple-300' : 'text-slate-600'}`}>
                          {isEventSales ? 'ON' : 'OFF'}
                        </span>
                        <span className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                          isEventSales ? 'bg-purple-500' : 'bg-slate-700'
                        }`}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                            isEventSales ? 'left-5' : 'left-0.5'
                          }`} />
                        </span>
                      </button>

                      {showOnlyMenuSaveSuccess && (
                        <div className="text-center text-sm font-semibold text-emerald-400 animate-pulse mb-2">저장 완료 ✓</div>
                      )}
                      <button type="button" onClick={() => handleSave()} disabled={saving}
                        className="w-full rounded-2xl bg-sky-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">
                        {saving ? '저장 중...' : `저장하기 (메뉴 ${editableMenuItems.length}개)`}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── MANUAL MODE ────────────────────────────────────────────────── */}
              {parseMode === 'manual' && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
                  <h2 className="text-lg font-semibold">✏️ 빠른 수동 입력</h2>
                  <p className="mt-1 text-xs text-slate-400">사진 없이 매출 금액만 직접 입력합니다.</p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-slate-300">날짜</label>
                      <input type="date" value={manualRecord.date} onChange={(e) => setManualRecord({ ...manualRecord, date: e.target.value })} className="w-full mt-2 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-300">총매출금액</label>
                      <input type="number" placeholder="예: 450000" value={manualRecord.totalRevenue || ''} onChange={(e) => setManualRecord({ ...manualRecord, totalRevenue: Number(e.target.value) })} className="w-full mt-2 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-300">서비스금액 (선택)</label>
                      <input type="number" placeholder="예: 0" value={manualRecord.serviceAmount || ''} onChange={(e) => setManualRecord({ ...manualRecord, serviceAmount: Number(e.target.value) })} className="w-full mt-2 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-slate-300">현금</label>
                        <input type="number" value={manualRecord.cashAmount || ''} onChange={(e) => setManualRecord({ ...manualRecord, cashAmount: Number(e.target.value) })} className="w-full mt-2 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-300">카드</label>
                        <input type="number" value={manualRecord.cardAmount || ''} onChange={(e) => setManualRecord({ ...manualRecord, cardAmount: Number(e.target.value) })} className="w-full mt-2 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100" />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-300">고객수 (선택)</label>
                      <input type="number" value={manualRecord.guestCount || ''} onChange={(e) => setManualRecord({ ...manualRecord, guestCount: Number(e.target.value) })} className="w-full mt-2 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-300">메모 (선택)</label>
                      <input type="text" placeholder='예: "맹호부대 행사"' value={manualRecord.note || ''} onChange={(e) => setManualRecord({ ...manualRecord, note: e.target.value })} className="w-full mt-2 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100" />
                    </div>
                  </div>

                  {/* 행사 매출 토글 */}
                  <button
                    type="button"
                    onClick={() => setIsEventSales((v) => !v)}
                    className={`flex items-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium transition mt-4 ${
                      isEventSales
                        ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                        : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-lg">🎪</span>
                    <span>행사 매출</span>
                    <span className={`ml-auto text-xs font-bold ${isEventSales ? 'text-purple-300' : 'text-slate-600'}`}>
                      {isEventSales ? 'ON' : 'OFF'}
                    </span>
                    <span className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                      isEventSales ? 'bg-purple-500' : 'bg-slate-700'
                    }`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                        isEventSales ? 'left-5' : 'left-0.5'
                      }`} />
                    </span>
                  </button>

                  <button type="button" onClick={handleSaveManual} disabled={saving}
                    className="w-full mt-4 rounded-2xl bg-sky-500 px-6 py-4 text-base font-bold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? '저장 중...' : '저장하기'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── HISTORY TAB ───────────────────────────────────────────────────── */}
          {tab === 'history' && (
            <div className="space-y-4">
              {historyMsg && (
                <div className={`rounded-2xl border p-4 text-sm ${historyMsg.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                  {historyMsg.text}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">매출 내역</h2>
                <span className="text-xs font-semibold text-sky-400 bg-sky-950/60 border border-sky-800/50 rounded-full px-3 py-1 self-start sm:self-auto">
                  {filteredSalesHistory.length}건 · 합계 {(historySumRevenue / 10000).toFixed(1)}만원
                </span>
              </div>

              <PeriodSelector
                value={historyPeriodValue}
                onChange={setHistoryPeriodValue}
                availableMonths={availableMonths}
              />

              {historyLoading ? (
                <div className="py-20 text-center text-slate-400 text-sm animate-pulse">불러오는 중...</div>
              ) : historyError ? (
                <div className="rounded-2xl border border-rose-800 bg-rose-950/40 p-4 text-rose-400 text-sm">{historyError}</div>
              ) : filteredSalesHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl">
                  선택한 기간에 등록된 매출 내역이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSalesHistory.map((record) => {
                    const isExpanded = expandedId === record.id!;
                    const draft = drafts[record.id!];
                    const menuCount = record.menuItems?.length ?? 0;
                    return (
                      <div key={record.id!} className="rounded-2xl border border-slate-800 bg-slate-900/90">
                        <button className="w-full p-4 flex items-center justify-between text-left" onClick={() => toggleExpand(record)}>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-100 flex items-center gap-2">
                              <span>{new Date(record.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                              {menuCount === 0 && (
                                <span className="rounded bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-400 border border-orange-500/30">
                                  📋 메뉴 미입력
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-400">
                              순매출 {(record.netRevenue / 10000).toFixed(1)}만원
                              {(record.serviceAmount ?? 0) > 0 && ` · 서비스 ${((record.serviceAmount ?? 0) / 10000).toFixed(1)}만원`}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              현금 {Math.round((record.cashAmount ?? 0) / 10000)}만 · 카드 {Math.round((record.cardAmount ?? 0) / 10000)}만 · 고객 {record.guestCount ?? 0}명{menuCount > 0 ? ` · 메뉴 ${menuCount}개` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <p className="text-lg font-bold text-sky-400">{(record.totalRevenue / 10000).toFixed(0)}만원</p>
                            <span className="text-slate-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </button>

                        {isExpanded && draft && (role === 'owner' || role === 'manager' || record.createdBy === currentUserId) && (
                          <div className="border-t border-slate-800 p-4 space-y-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">수정</p>
                            <div><label className="text-xs text-slate-400">날짜</label><input type="date" value={draft.date} onChange={(e) => patchDraft(record.id!, { date: e.target.value })} className={iClsDark} /></div>
                            <div className="grid grid-cols-2 gap-3">
                              <div><label className="text-xs text-slate-400">총매출</label><input type="number" value={draft.totalRevenue} onChange={(e) => patchDraft(record.id!, { totalRevenue: Number(e.target.value) })} className={iClsDark} /></div>
                              <div><label className="text-xs text-slate-400">서비스금액</label><input type="number" value={draft.serviceAmount} onChange={(e) => patchDraft(record.id!, { serviceAmount: Number(e.target.value) })} className={iClsDark} /></div>
                              <div><label className="text-xs text-slate-400">순매출</label><input type="number" value={draft.netRevenue} onChange={(e) => patchDraft(record.id!, { netRevenue: Number(e.target.value) })} className={iClsDark} /></div>
                              <div><label className="text-xs text-slate-400">부가세</label><input type="number" value={draft.tax} onChange={(e) => patchDraft(record.id!, { tax: Number(e.target.value) })} className={iClsDark} /></div>
                              <div><label className="text-xs text-slate-400">현금</label><input type="number" value={draft.cashAmount} onChange={(e) => patchDraft(record.id!, { cashAmount: Number(e.target.value) })} className={iClsDark} /></div>
                              <div><label className="text-xs text-slate-400">카드</label><input type="number" value={draft.cardAmount} onChange={(e) => patchDraft(record.id!, { cardAmount: Number(e.target.value) })} className={iClsDark} /></div>
                              <div><label className="text-xs text-slate-400">고객수</label><input type="number" value={draft.guestCount} onChange={(e) => patchDraft(record.id!, { guestCount: Number(e.target.value) })} className={iClsDark} /></div>
                              <div><label className="text-xs text-slate-400">객단가</label><input type="number" value={draft.avgSpend} onChange={(e) => patchDraft(record.id!, { avgSpend: Number(e.target.value) })} className={iClsDark} /></div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-slate-400 font-semibold">메뉴 항목 ({draft.menuItems.length}개)</p>
                                <button onClick={() => addDraftItem(record.id!)} className="text-xs text-sky-400 hover:text-sky-300">+ 추가</button>
                              </div>
                              {draft.menuItems.length === 0 ? (
                                <div className="flex flex-col gap-2">
                                  <button type="button" onClick={() => handleAddMenuMode(record)} className="w-full rounded-xl bg-orange-500/10 border border-orange-500/30 py-3 text-sm font-semibold text-orange-400 hover:bg-orange-500/20 transition">
                                    📸 메뉴별 매출 사진으로 추가
                                  </button>
                                  <button type="button" onClick={() => addDraftItem(record.id!)} className="w-full rounded-xl border border-dashed border-slate-700 py-3 text-xs text-slate-500 hover:text-sky-400 hover:border-sky-700">
                                    + 수동 메뉴 항목 추가
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                  {draft.menuItems.map((item, idx) => (
                                    <div key={idx} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                      <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-xs text-slate-500">{idx + 1}</span>
                                        <button onClick={() => deleteDraftItem(record.id!, idx)} className="text-xs text-rose-400 hover:text-rose-300">삭제</button>
                                      </div>
                                      <input type="text" value={item.name} onChange={(e) => updateDraftItem(record.id!, idx, { name: e.target.value })} placeholder="메뉴명" className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100 mb-2" />
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <p className="text-xs text-slate-500 mb-1">수량</p>
                                          <input type="number" value={item.quantity} onChange={(e) => updateDraftItem(record.id!, idx, { quantity: Number(e.target.value) })} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100" />
                                        </div>
                                        <div>
                                          <p className="text-xs text-slate-500 mb-1">금액</p>
                                          <input type="number" value={item.amount} onChange={(e) => updateDraftItem(record.id!, idx, { amount: Number(e.target.value) })} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100" />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <button onClick={() => saveHistoryDraft(record.id!)} disabled={savingId === record.id!}
                              className="w-full rounded-2xl bg-sky-500 py-4 text-base font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed">
                              {savingId === record.id! ? '저장 중...' : '저장하기'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
