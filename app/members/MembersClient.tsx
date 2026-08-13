'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Member {
  id: string;
  store_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'staff';
  created_at: string;
  email: string;
}

interface Invite {
  id: string;
  store_id: string;
  email: string;
  role: 'manager' | 'staff';
  invited_by: string;
  accepted: boolean;
  created_at: string;
}

interface MembersClientProps {
  storeName: string;
  initialMembers: Member[];
  initialInvites: Invite[];
  currentUserId: string;
}

export default function MembersClient({
  storeName,
  initialMembers,
  initialInvites,
  currentUserId,
}: MembersClientProps) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  
  // Form states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('staff');
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Action loading states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      const res = await fetch('/api/members');
      if (res.ok) {
        const body = await res.json();
        if (body.data) {
          setMembers(body.data.members);
          setInvites(body.data.invites);
        }
      }
    } catch (err) {
      console.error('Failed to refresh members list:', err);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError(null);
    setSuccess(null);
    setLoadingInvite(true);

    try {
      const res = await fetch('/api/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || '초대 발송에 실패했습니다.');
      }
      setSuccess('초대를 성공적으로 발송했습니다.');
      setInviteEmail('');
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleDeleteMember = async (id: string, email: string) => {
    if (!confirm(`${email} 멤버를 매장에서 제외하시겠습니까?`)) return;
    setDeletingId(id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/members/${id}?type=member`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || '멤버 제외에 실패했습니다.');
      }
      setSuccess('멤버를 성공적으로 제외했습니다.');
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancelInvite = async (id: string, email: string) => {
    if (!confirm(`${email} 초대를 취소하시겠습니까?`)) return;
    setDeletingId(id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/members/${id}?type=invite`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || '초대 취소에 실패했습니다.');
      }
      setSuccess('초대를 취소했습니다.');
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyInviteText = async (invite: Invite) => {
    const inviteText = `[${storeName}]에서 매장닥터로 초대했어요!\n아래 링크로 접속해서 Google 계정(${invite.email})으로 로그인해주세요.\nhttps://www.store-doctor.com`;
    
    try {
      await navigator.clipboard.writeText(inviteText);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = inviteText;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedId(invite.id);
        setTimeout(() => setCopiedId(null), 1500);
      } catch (e) {
        alert('안내문구 복사에 실패했습니다. 수동으로 복사해주세요.');
      }
      document.body.removeChild(textArea);
    }
  };

  const roleLabels = {
    owner: '소유주(Owner)',
    manager: '매니저(Manager)',
    staff: '직원(Staff)',
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 pb-32">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="text-slate-400 hover:text-slate-200 text-lg"
          >
            ← 설정
          </button>
          <h1 className="text-3xl font-bold">👥 멤버 관리 ({storeName})</h1>
        </div>

        {/* Message Banner */}
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {success}
          </div>
        )}

        {/* 1. 멤버 초대 폼 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
          <h2 className="text-lg font-semibold">새 멤버 초대</h2>
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400">초대할 이메일</label>
              <input
                type="email"
                required
                placeholder="example@gmail.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">역할 권한</label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value="staff"
                    checked={inviteRole === 'staff'}
                    onChange={() => setInviteRole('staff')}
                    className="accent-sky-500 w-4 h-4"
                  />
                  <span>직원 (스태프)</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value="manager"
                    checked={inviteRole === 'manager'}
                    onChange={() => setInviteRole('manager')}
                    className="accent-sky-500 w-4 h-4"
                  />
                  <span>매니저 (정산 권한 포함)</span>
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={loadingInvite || !inviteEmail}
              className="w-full rounded-2xl bg-sky-500 py-3.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingInvite ? '초대 중...' : '초대장 발송'}
            </button>
          </form>
        </div>

        {/* 2. 현재 멤버 목록 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
          <h2 className="text-lg font-semibold">현재 가입 멤버 ({members.length}명)</h2>
          <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto pr-1">
            {members.map((member) => {
              const isSelf = member.user_id === currentUserId;
              return (
                <div key={member.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium text-slate-100 text-sm">
                      {member.email} {isSelf && <span className="text-xs text-sky-400 font-bold ml-1">(나)</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      권한: <strong className="font-semibold text-slate-300">{roleLabels[member.role] || member.role}</strong>
                    </p>
                  </div>
                  {!isSelf && (
                    <button
                      type="button"
                      disabled={deletingId === member.id}
                      onClick={() => handleDeleteMember(member.id, member.email)}
                      className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition disabled:opacity-50"
                    >
                      {deletingId === member.id ? '제외 중...' : '매장 제외'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. 초대 대기 목록 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
          <h2 className="text-lg font-semibold">초대 대기 멤버 ({invites.length}명)</h2>
          {invites.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">대기 중인 초대가 없습니다.</p>
          ) : (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto pr-1">
              {invites.map((invite) => (
                <div key={invite.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium text-slate-100 text-sm">{invite.email}</p>
                    <p className="text-xs text-slate-400">
                      예정 권한: <strong className="font-semibold text-slate-300">{roleLabels[invite.role] || invite.role}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {copiedId === invite.id ? (
                      <span className="text-xs font-bold text-emerald-400 animate-pulse px-2">복사됨 ✓</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCopyInviteText(invite)}
                        className="rounded-xl border border-slate-700 bg-slate-850 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:border-slate-600 active:scale-[0.98] transition"
                      >
                        안내문구 복사
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={deletingId === invite.id}
                      onClick={() => handleCancelInvite(invite.id, invite.email)}
                      className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition disabled:opacity-50"
                    >
                      {deletingId === invite.id ? '취소 중...' : '초대 취소'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
