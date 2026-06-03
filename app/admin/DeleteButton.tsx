'use client';

import { useState } from 'react';
import { deleteStore, deleteInviteCode } from './actions';

export function DeleteStoreButton({ storeId, ownerId }: { storeId: string, ownerId: string | null }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm('정말 삭제하시겠습니까?\n\n이 유저의 로그인 계정, 매장 정보, 모든 매출/매입 데이터가 영구 삭제되며 복구할 수 없습니다.')) return;
    
    try {
      setLoading(true);
      await deleteStore(storeId, ownerId);
    } catch (e: any) {
      alert(e.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-2 py-1 bg-rose-900/50 hover:bg-rose-600/80 text-rose-300 hover:text-white rounded text-xs transition border border-rose-800/50 whitespace-nowrap"
    >
      {loading ? '삭제중...' : '삭제'}
    </button>
  );
}

export function DeleteCodeButton({ code }: { code: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`'${code}' 코드를 정말 삭제하시겠습니까?`)) return;
    
    try {
      setLoading(true);
      await deleteInviteCode(code);
    } catch (e: any) {
      alert(e.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-2 py-1 bg-rose-900/50 hover:bg-rose-600/80 text-rose-300 hover:text-white rounded text-xs transition border border-rose-800/50 whitespace-nowrap"
    >
      {loading ? '삭제중...' : '삭제'}
    </button>
  );
}
