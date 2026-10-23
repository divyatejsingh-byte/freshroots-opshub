import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Shared-password gate for the whole app, including the APIs that read and write Supabase.
 * - Set APP_PASSWORD. People sign in at /login and get a signed 7-day session cookie.
 * - In production the app refuses to serve without a password, so a missing variable can never leave it open.
 * - /api/cron/* is exempt: Vercel Cron cannot sign in, and the route checks CRON_SECRET itself.
 * - In development with no APP_PASSWORD the gate is off.
 */
const OPEN = ["/login", "/api/login", "/api/logout", "/api/cron/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"))) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") return new NextResponse("APP_PASSWORD is not configured", { status: 503 });
    return NextResponse.next();
  }

  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value, password)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
