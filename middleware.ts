import { NextResponse, type NextRequest } from "next/server";

/**
 * Shared-password gate (HTTP Basic auth) for the whole app, including the APIs that read and write Supabase.
 * - Set APP_PASSWORD. Any username works; the browser shows its own sign-in prompt.
 * - In production the app refuses to serve without a password, so a missing variable can never leave it open.
 * - /api/cron/* is exempt: Vercel Cron cannot send a password, and the route checks CRON_SECRET itself.
 * - In development with no APP_PASSWORD the gate is off.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/cron/")) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") return new NextResponse("APP_PASSWORD is not configured", { status: 503 });
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(given, password)) return NextResponse.next();
    } catch {
      /* malformed header: fall through to the challenge */
    }
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Freshroots OpsHub", charset="UTF-8"' } });
}

/** Compares without bailing out at the first differing character */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
