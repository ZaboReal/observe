"use server";

import type { ObserveDecision } from "@observe/next";
import { observe } from "@observe/next/server";

export interface InviteState {
  email?: string;
  decision?: ObserveDecision;
  message?: string;
}

/** Invite a teammate. Server actions post to the page they run on, so `<Observe protect>` lists `POST /`. */
export async function inviteTeammate(_prev: InviteState, form: FormData): Promise<InviteState> {
  const email = String(form.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { message: "Enter an email address." };

  // Observe mode: show and log what Observe says, never act on it.
  const decision = await observe.check("invite_teammate", { method: "POST", path: "/" });
  return { email, decision, message: `Invitation sent to ${email}.` };
}
