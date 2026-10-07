# Objection: "Why visas? I can rate-limit my API or MCP, or not expose certain actions"

## Short answer

"Rate limits and hidden endpoints only control traffic that comes through your API or MCP server. The agents growing fastest don't use either. Claude in Chrome, Comet and Gemini in Chrome drive your web app with the customer's own login. Your API gateway never sees them, and your rate limiter counts them as the person. You can't limit what you can't tell apart, and you can't hide the Export button from the agent without hiding it from the person too."

## The longer answer

### 1. Different door

- An in-browser agent clicks the same buttons a person clicks, with the same cookies, IP and device.
- So API and MCP controls never apply to it.
- Tighten the API, and agents move further onto the UI. That path is slower, breaks more often, and you can't see it.

### 2. "Don't expose it" doesn't work in a UI

- Export, Delete and Invite exist because people need them.
- The only way to hide them from an agent is to know an agent is driving. That is detection, the first half of what we build.
- A visa then lets the same button behave differently for the person and for their agent.

### 3. A rate limit measures volume, not permission

- The damaging agent actions are low-volume: one export of the customer list, one external invite, one payroll change.
- A prompt-injected agent can do all three under any sensible limit.
- A rate limit can't express "this agent may read reports but not change payroll." A visa can.

### 4. The wrong person sets the limit

- API scopes and rate limits are set once by the vendor, or at OAuth install.
- Enterprise buyers now ask a different question: which agents may do what in our workspace, and can I switch one off?
- That needs per-agent, per-user, revocable permission that the customer's admin and end user control, not a global number in your gateway.

### 5. No record of who acted

- A rate limiter logs "user 8a41 made 40 requests."
- SOC 2 auditors, regulated customers and EU AI Act deployers want "Claude in Chrome, acting for Morgan under visa V-7F3A, exported 4,210 rows at 10:44."
- Throttling produces none of that.

### 6. Blunt limits cost money

- Most SaaS companies want agent usage to grow, because it drives engagement and is billable.
- A rate limit can only slow or block.
- A visa can also admit, meter, bill, or reroute the agent to a cheaper tool. Good agents are rewarded instead of throttled with everyone else.

## Where the objection has a point

If a product's agent traffic all arrives through its own API or MCP server with OAuth, then OAuth scopes plus rate limits already work like a visa, and our pitch is weaker there. Two answers:

- **We're aiming at a different customer.** Our first target is SaaS with a rich web UI, where agents drive the browser.
- **We don't replace rate limits.** "Slow" is one of our seven outcomes. The visa should also cover the customer's OAuth and MCP clients, so one policy governs the UI, the API and MCP. Otherwise an agent blocked in the UI just moves to the API.

## A concrete example

Morgan asks Claude in Chrome to summarise last quarter's invoices. A malicious email in their inbox tells the agent to export the full customer list and email it out. That's two clicks, well under any rate limit, and the API is never touched.

With a visa, the export falls outside the agent's scope, so the agent is told no. Emailing anyone outside the company needs Morgan's passkey. Both attempts are logged against the agent.
