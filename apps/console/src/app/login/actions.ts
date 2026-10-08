"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, SESSION_DAYS, checkPassword, newSession } from "@/lib/auth";

/** Only paths on this console, so the sign-in page cannot be used to send people elsewhere. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const attempt = form.get("password");
  if (typeof attempt !== "string" || !(await checkPassword(attempt))) return { error: "That password isn't right." };
  (await cookies()).set(SESSION_COOKIE, await newSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect(safeNext(form.get("next")));
}
