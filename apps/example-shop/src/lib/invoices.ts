/** Fake data for the demo. */
export interface Invoice {
  id: string;
  customer: string;
  issued: string;
  due: string;
  amount: number;
  status: "Paid" | "Open" | "Overdue";
}

export const INVOICES: Invoice[] = [
  { id: "INV-1042", customer: "Northwind Traders", issued: "2026-09-02", due: "2026-10-02", amount: 4820, status: "Paid" },
  { id: "INV-1043", customer: "Globex Corporation", issued: "2026-09-09", due: "2026-10-09", amount: 12750, status: "Open" },
  { id: "INV-1044", customer: "Initech", issued: "2026-09-12", due: "2026-10-12", amount: 960, status: "Open" },
  { id: "INV-1045", customer: "Umbrella Health", issued: "2026-08-21", due: "2026-09-21", amount: 7300, status: "Overdue" },
  { id: "INV-1046", customer: "Stark Logistics", issued: "2026-09-30", due: "2026-10-30", amount: 2145, status: "Open" },
];

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function toCsv(rows: Invoice[]): string {
  const head = "id,customer,issued,due,amount,status";
  return [head, ...rows.map((r) => [r.id, `"${r.customer}"`, r.issued, r.due, r.amount, r.status].join(","))].join("\n") + "\n";
}
