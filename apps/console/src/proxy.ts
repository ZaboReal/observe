import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, authEnabled, validSession } from "@/lib/auth";

/**
 * Keeps a deployed console behind its password. The sensor's collector endpoint stays open (it only accepts
 * batches for the site's key), and so does the sign-in page.
 */
export async function proxy(req: NextRequest) {
  if (!authEnabled() || (await validSession(req.cookies.get(SESSION_COOKIE)?.value))) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return Response.json({ error: "Sign in to the console first." }, { status: 401 });
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/v1/sdk/|_next/static|_next/image|favicon\\.ico|icon|robots\\.txt).*)"],
};
