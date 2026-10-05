import { NextResponse } from "next/server";
import { z } from "zod";

import {
  authConfigured,
  createSessionToken,
  sessionCookieOptions,
  verifyCredentials,
} from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured on the server" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid credentials" },
      { status: 400 }
    );
  }

  const { username, password } = parsed.data;
  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieOptions.name, token, {
    httpOnly: sessionCookieOptions.httpOnly,
    secure: sessionCookieOptions.secure,
    sameSite: sessionCookieOptions.sameSite,
    path: sessionCookieOptions.path,
    maxAge: sessionCookieOptions.maxAge,
  });
  return response;
}
