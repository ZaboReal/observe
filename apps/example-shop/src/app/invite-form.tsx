"use client";

import { useActionState } from "react";

import { inviteTeammate, type InviteState } from "./actions";
import { Decision } from "./decision";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteTeammate, {});
  return (
    <form action={action} className="invite">
      <label htmlFor="email">Teammate&apos;s email</label>
      <div className="row">
        <input id="email" name="email" type="email" placeholder="sam@acme.test" defaultValue={state.email} required />
        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Invite teammate"}
        </button>
      </div>
      {state.message && <p>{state.message}</p>}
      {state.decision && <Decision decision={state.decision} />}
    </form>
  );
}
