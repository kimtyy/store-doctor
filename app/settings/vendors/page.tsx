'use client';

import { useCallback, useEffect, useState } from 'react';
import BottomTabNav from '../../../components/BottomTabNav';

interface MasterRow {
  id: string;
  vendor_name: string;
  aliases: string[];
}

interface DraftRow {
  id: string | null;
  vendorName: string;
  aliases: string[];
  aliasInput: string;
  dirty: boolean;
}

function rowFromMaster(m: MasterRow): DraftRow {
  return { id: m.id, vendorName: m.vendor_name, aliases: m.aliases ?? [], aliasInput: '', dirty: false };
}

function newDraftRow(name = ''): DraftRow {
  return { id: null, vendorName: name, aliases: [], aliasInput: '', dirty: true };
}

export default function VendorMasterPage() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vendor-master');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '불러오기 실패');
      setRows((body.data ?? []).map(rowFromMaster));
      setUnmapped(body.unmapped ?? []);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '불러오기 실패' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function saveRow(idx: number) {
    const row = rows[idx];
    if (!row.vendorName.trim()) return;
    setSaving(true);
    try {
      if (row.id === null) {
        const res = await fetch('/api/vendor-master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendorName: row.vendorName.trim(), aliases: row.aliases }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? '저장 실패');
        setRows((prev) => prev.map((r, i) =>
          i === idx ? { ...r, id: body.data.id, dirty: false } : r
        ));
      } else {
        const res = await fetch('/api/vendor-master', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, vendorName: row.vendorName.trim(), aliases: row.aliases }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? '저장 실패');
        setRows((prev) => prev.map((r, i) => i === idx ? { ...r, dirty: false } : r));
      }
      showMsg('success', '저장되었습니다.');
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(idx: number) {
    const row = rows[idx];
    if (!row.id) {
      setRows((prev) => prev.filter((_, i) => i !== idx));
      if (expandedIdx === idx) setExpandedIdx(null);
      return;
    }
    if (!confirm(`"${row.vendorName}"을(를) 삭제할까요?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/vendor-master?id=${row.id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '삭제 실패');
      setRows((prev) => prev.filter((_, i) => i !== idx));
      if (expandedIdx === idx) setExpandedIdx(null);
      showMsg('success', '삭제되었습니다.');
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  }

  function addAlias(idx: number) {
    const row = rows[idx];
    const alias = row.aliasInput.trim();
    if (!alias || row.aliases.includes(alias)) return;
    setRows((prev) => prev.map((r, i) =>
      i === idx ? { ...r, aliases: [...r.aliases, alias], aliasInput: '', dirty: true } : r
    ));
  }

  function removeAlias(idx: number, alias: string) {
    setRows((prev) => prev.map((r, i) =>
      i === idx ? { ...r, aliases: r.aliases.filter((a) => a !== alias), dirty: true } : r
    ));
  }

  function addUnmapped(name: string) {
    setUnmapped((prev) => prev.filter((v) => v !== name));
    const newRow = newDraftRow(name);
    setRows((prev) => [newRow, ...prev]);
    setExpandedIdx(0);
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
          <a href="/settings" className="text-slate-400 hover:text-slate-200 text-lg">←</a>
          <h1 className="text-xl font-bold text-slate-100">매입처 관리</h1>
        </div>
      </header>

      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl space-y-5">

          {message && (
            <div className={`rounded-2xl border p-4 text-sm ${
              message.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            }`}>
              {message.text}
            </div>
          )}

          <p className="text-xs text-slate-500">
            정식 매입처명과 OCR 오인식 별칭을 등록하면 영수증 파싱 시 자동으로 교정됩니다.
          </p>

          {/* Unmapped vendors */}
          {unmapped.length > 0 && (
            <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-300">미등록 매입처 ({unmapped.length})</p>
              <p className="text-xs text-slate-400">아래 매입처는 마스터에 등록되지 않았습니다. 탭하면 새 항목으로 추가됩니다.</p>
              <div className="flex flex-wrap gap-2">
                {unmapped.map((v) => (
                  <button
                    key={v}
                    onClick={() => addUnmapped(v)}
                    className="text-xs px-3 py-1.5 rounded-full border border-amber-700/60 text-amber-300 hover:bg-amber-900/30 transition"
                  >
                    + {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add new */}
          <button
            onClick={() => {
              const newRow = newDraftRow();
              setRows((prev) => [newRow, ...prev]);
              setExpandedIdx(0);
            }}
            className="w-full rounded-2xl border border-dashed border-slate-700 py-4 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-300 transition"
          >
            + 새 매입처 추가
          </button>

          {/* Loading */}
          {loading && (
            <div className="text-center py-10 text-slate-500 text-sm animate-pulse">불러오는 중...</div>
          )}

          {/* Rows */}
          {!loading && rows.map((row, idx) => (
            <div
              key={row.id ?? `new-${idx}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden"
            >
              {/* Header row */}
              <button
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-slate-100 truncate">
                    {row.vendorName || <span className="text-slate-500 italic">새 매입처</span>}
                  </span>
                  {row.aliases.length > 0 && (
                    <span className="text-xs text-slate-500 shrink-0">별칭 {row.aliases.length}개</span>
                  )}
                  {row.dirty && (
                    <span className="text-xs text-amber-400 shrink-0">미저장</span>
                  )}
                </div>
                <span className="text-slate-500 text-sm ml-2">{expandedIdx === idx ? '▲' : '▼'}</span>
              </button>

              {/* Expanded editor */}
              {expandedIdx === idx && (
                <div className="border-t border-slate-800 px-5 py-4 space-y-4">
                  {/* Vendor name */}
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5">정식 매입처명</p>
                    <input
                      type="text"
                      value={row.vendorName}
                      onChange={(e) => setRows((prev) => prev.map((r, i) =>
                        i === idx ? { ...r, vendorName: e.target.value, dirty: true } : r
                      ))}
                      placeholder="예: 풍원식품(주)"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  {/* Aliases */}
                  <div>
                    <p className="text-xs text-slate-500 mb-2">OCR 별칭 (오인식 패턴)</p>
                    {row.aliases.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {row.aliases.map((alias) => (
                          <span
                            key={alias}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300"
                          >
                            {alias}
                            <button
                              onClick={() => removeAlias(idx, alias)}
                              className="text-slate-500 hover:text-rose-400 leading-none"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={row.aliasInput}
                        onChange={(e) => setRows((prev) => prev.map((r, i) =>
                          i === idx ? { ...r, aliasInput: e.target.value } : r
                        ))}
                        onKeyDown={(e) => e.key === 'Enter' && addAlias(idx)}
                        placeholder="별칭 입력 후 Enter 또는 + 버튼"
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                      />
                      <button
                        onClick={() => addAlias(idx)}
                        className="px-4 py-2 rounded-xl bg-slate-700 text-sm text-slate-200 hover:bg-slate-600 transition"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => saveRow(idx)}
                      disabled={saving || !row.vendorName.trim()}
                      className="flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40 transition"
                    >
                      {saving ? '저장 중...' : '저장'}
                    </button>
                    <button
                      onClick={() => deleteRow(idx)}
                      disabled={saving}
                      className="px-4 py-2.5 rounded-xl border border-rose-800/60 text-sm text-rose-400 hover:bg-rose-950/40 disabled:opacity-40 transition"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!loading && rows.length === 0 && unmapped.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-sm">
              등록된 매입처가 없습니다.
            </div>
          )}
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
