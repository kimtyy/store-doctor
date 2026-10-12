import { createClient } from '@/utils/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('[SignOut Route POST] supabase.auth.signOut error:', err);
  }

  const response = NextResponse.json({ success: true });

  // Clear all auth cookies explicitly in response headers
  const allCookies = request.cookies.getAll();
  for (const cookie of allCookies) {
    if (
      cookie.name.includes('sb-') ||
      cookie.name.includes('supabase') ||
      cookie.name.includes('auth-token')
    ) {
      response.cookies.set({
        name: cookie.name,
        value: '',
        path: '/',
        expires: new Date(0),
        maxAge: 0,
      });
    }
  }

  return response;
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('[SignOut Route GET] supabase.auth.signOut error:', err);
  }

  const response = NextResponse.redirect(new URL('/login', request.url), { status: 302 });

  const allCookies = request.cookies.getAll();
  for (const cookie of allCookies) {
    if (
      cookie.name.includes('sb-') ||
      cookie.name.includes('supabase') ||
      cookie.name.includes('auth-token')
    ) {
      response.cookies.set({
        name: cookie.name,
        value: '',
        path: '/',
        expires: new Date(0),
        maxAge: 0,
      });
    }
  }

  return response;
}
