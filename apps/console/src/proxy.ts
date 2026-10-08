import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, authEnabled, validSession } from "@/lib/auth";

/**
 * Keeps a deployed console behind its password. The sensor's collector stays open (it only takes its sites' keys),
 * decide authenticates with a site's secret key, and the hosted sensor, its manifest and llms.txt are public.
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
  // Open: sign-in, the collector, decide (it takes the site's secret key), the hosted sensor and package, and the
  // agent install guide.
  matcher: ["/((?!login|api/v1/sdk/|api/v1/decide|sensor/|packages/|llms\\.txt|_next/static|_next/image|favicon\\.ico|icon|robots\\.txt).*)"],
};
