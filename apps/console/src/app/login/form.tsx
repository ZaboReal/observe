"use client";

import { useActionState } from "react";

import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, { error: null });
  return (
    <form action={action} className="mt-7 grid gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password" className="sr-only">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        placeholder="Password"
        className="h-[50px] rounded-full border-0 bg-sheet px-5 text-[15px] text-ink shadow-sheet outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_2px_var(--color-ink)]"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-[50px] rounded-full bg-ink text-[15px] font-medium text-white shadow-btn transition-[background-color,transform] hover:bg-[#262a30] active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-center text-[13px] text-red">
        {state.error}
      </p>
    </form>
  );
}
