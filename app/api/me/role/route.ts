import { NextResponse } from 'next/server';
import { getMemberAccess } from '@/utils/supabase/getStore';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ role: null, userId: null, storeId: null, isAdmin: false });
    }

    const isAdmin = !!user.email && user.email === process.env.ADMIN_EMAIL;
    const access = await getMemberAccess(user.id);

    if (access.access === 'suspended') {
      return NextResponse.json({
        role: 'suspended',
        reason: access.reason,
        message: access.message,
        userId: user.id,
        storeId: null,
        isAdmin,
      });
    }

    return NextResponse.json({
      role: access.role,
      userId: user.id,
      storeId: access.storeId,
      isAdmin,
    });
  } catch {
    return NextResponse.json({ role: null, userId: null, storeId: null, isAdmin: false });
  }
}
