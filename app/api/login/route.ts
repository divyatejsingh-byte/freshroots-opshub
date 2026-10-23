import { NextResponse } from "next/server";
import { createSession, passwordMatches, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.json({ error: "Sign-in is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || !(await passwordMatches(body.password, expected))) {
    // A short delay makes guessing slower
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
