import { ExportButton } from "./export-button";
import { InviteForm } from "./invite-form";
import { SHOW_DECISIONS } from "@/lib/display";
import { INVOICES, money } from "@/lib/invoices";

export default function Page() {
  const outstanding = INVOICES.filter((i) => i.status !== "Paid").reduce((sum, i) => sum + i.amount, 0);
  return (
    <main>
      <header>
        <div>
          <p className="brand">Acme</p>
          <h1>Invoices</h1>
          <p className="muted">{money(outstanding)} outstanding across {INVOICES.length} invoices</p>
        </div>
        <ExportButton />
      </header>

      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Issued</th>
            <th>Due</th>
            <th className="num">Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {INVOICES.map((inv) => (
            <tr key={inv.id}>
              <td className="mono">{inv.id}</td>
              <td>{inv.customer}</td>
              <td>{inv.issued}</td>
              <td>{inv.due}</td>
              <td className="num">{money(inv.amount)}</td>
              <td>
                <span className={`status ${inv.status.toLowerCase()}`}>{inv.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <h2>Team</h2>
        <InviteForm />
      </section>

      {SHOW_DECISIONS && (
        <footer className="muted">
          Exports and invites are checked with <code>observe.check()</code> on the server. Observe is in observe mode: it
          reports what it would do and blocks nothing unless this app acts on <code>wouldBlock</code>.
        </footer>
      )}
    </main>
  );
}
