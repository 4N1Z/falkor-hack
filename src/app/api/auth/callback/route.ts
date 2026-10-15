import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from 'next/server';


export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase =  createClient();
    await (await supabase).auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${requestUrl.origin}/dashboard`);
}