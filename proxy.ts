import { NextResponse, type NextRequest } from "next/server";
import { proxyRedirect } from "@/lib/auth/redirects";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, hasSession } = await updateSession(request);
  const target = proxyRedirect(request.nextUrl.pathname, hasSession);

  if (!target) {
    return response;
  }

  const redirect = NextResponse.redirect(new URL(target, request.url));
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
