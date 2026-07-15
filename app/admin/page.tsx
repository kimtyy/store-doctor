import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { DeleteStoreButton, DeleteCodeButton } from './DeleteButton';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    redirect('/');
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 데이터 로드 (관리자 권한)
  const { data: userData } = await adminClient.auth.admin.listUsers();
  const users = userData?.users || [];

  const { data: stores } = await adminClient.from('stores').select('*').order('created_at', { ascending: false });
  const { data: inviteCodes } = await adminClient.from('invite_codes').select('*').order('created_at', { ascending: false });

  // 유저 정보 매핑
  const storeList = (stores || []).map(store => {
    const owner = users.find(u => u.id === store.owner_id);
    return {
      ...store,
      ownerEmail: owner?.email || '미상'
    };
  });

  const codeList = (inviteCodes || []).map(code => {
    const usedByUser = users.find(u => u.id === code.used_by);
    return {
      ...code,
      usedByEmail: usedByUser?.email || null
    };
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 pb-32 max-w-4xl mx-auto">
      <div className="mb-8 border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <span>👑</span> 관리자 대시보드
        </h1>
        <p className="text-sm text-slate-400 mt-2">사장님만 접근 가능한 은밀한 페이지입니다.</p>
      </div>

      <div className="space-y-10">
        {/* 가입된 매장 목록 */}
        <section>
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span>🏪</span> 가입된 매장 현황 ({storeList.length}개)
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-800/50 text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">가입일</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">이메일</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">매장명</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">업종</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">지역</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {storeList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 whitespace-nowrap">
                      가입된 매장이 없습니다.
                    </td>
                  </tr>
                ) : (
                  storeList.map(store => (
                    <tr key={store.id} className="hover:bg-slate-800/20">
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {new Date(store.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-200 whitespace-nowrap">{store.ownerEmail}</td>
                      <td className="px-4 py-3 text-sky-400 whitespace-nowrap">{store.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{store.category || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{store.region || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <DeleteStoreButton storeId={store.id} ownerId={store.owner_id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 초대 코드 목록 */}
        <section>
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span>🎟️</span> 초대 코드 발급 현황 ({codeList.length}개)
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-800/50 text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">초대 코드</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">발급일</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-center">사용 여부</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">사용자 이메일</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {codeList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 whitespace-nowrap">
                      발급된 초대 코드가 없습니다.
                    </td>
                  </tr>
                ) : (
                  codeList.map(code => (
                    <tr key={code.code} className="hover:bg-slate-800/20">
                      <td className="px-4 py-3 font-mono text-emerald-400 font-medium whitespace-nowrap">
                        {code.code}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {new Date(code.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {code.is_used ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400">
                            사용 완료
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-sky-900/50 text-sky-400 border border-sky-800/50">
                            사용 가능
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {code.usedByEmail || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <DeleteCodeButton code={code.code} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
