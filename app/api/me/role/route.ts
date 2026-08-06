import { NextResponse } from 'next/server'
import { getUserRole } from '@/utils/supabase/getUserRole'

export const dynamic = 'force-dynamic'

/**
 * GET /api/me/role
 * 클라이언트 컴포넌트('use client')에서 현재 사용자의 store_members role을 조회하는
 * 경량 엔드포인트. 매 페이지마다 DB 직접 조회 없이 이 API 하나만 fetch한다.
 *
 * 응답: { role: 'owner' | 'manager' | 'staff' | null }
 * - null: 미로그인 또는 store_members에 행 없음
 */
export async function GET() {
  try {
    const role = await getUserRole()
    return NextResponse.json({ role })
  } catch {
    return NextResponse.json({ role: null })
  }
}
