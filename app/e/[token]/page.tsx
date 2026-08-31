import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Estimate, Unit } from "@/lib/types";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

const unitLabel = (u: Unit) =>
  ({ each: "each", sqft: "sq ft", hour: "hour", linear_ft: "linear ft", room: "room" } as Record<Unit, string>)[u] || u;

export default async function SharedEstimatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data, error } = await supabaseAdmin
    .from("estimates")
    .select("estimate_data, status")
    .eq("share_token", token)
    .maybeSingle();

  if (error || !data) {
    return (
      <main className="shared">
        <div className="sharedCard" style={{ textAlign: "center" }}>
          <h1>Кошторис не знайдено</h1>
          <p>Це посилання недійсне або кошторис було видалено.</p>
        </div>
      </main>
    );
  }

  if (data.status === "sent") {
    await supabaseAdmin
      .from("estimates")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("share_token", token);
  }

  const estimate = data.estimate_data as Estimate;
  const subtotal = estimate.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discount = Math.min(subtotal, estimate.discount || 0);
  const tax = ((subtotal - discount) * (estimate.tax || 0)) / 100;
  const total = subtotal - discount + tax;
  const deposit = (total * (estimate.deposit || 0)) / 100;

  return (
    <main className="shared">
      <div className="sharedCard">
        <div className="sharedHead">
          <div>
            <span className="sharedEyebrow">ESTIMATE</span>
            <h1>{estimate.project || "Estimate"}</h1>
            {estimate.client && <p>Client: {estimate.client}</p>}
            {estimate.address && <p>{estimate.address}</p>}
          </div>
          <PrintButton />
        </div>

        <table className="sharedTable">
          <thead>
            <tr>
              <th>Опис</th>
              <th>К-сть</th>
              <th>Ціна</th>
              <th>Разом</th>
            </tr>
          </thead>
          <tbody>
            {estimate.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.description}</strong>
                  {item.note && <div className="sharedNote">{item.note}</div>}
                </td>
                <td>
                  {item.quantity} {unitLabel(item.unit)}
                </td>
                <td>{money(item.unitPrice)}</td>
                <td>{money(item.quantity * item.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sharedTotals">
          <div>
            <span>Проміжна сума</span>
            <span>{money(subtotal)}</span>
          </div>
          <div>
            <span>Знижка</span>
            <span>−{money(discount)}</span>
          </div>
          <div>
            <span>Податок</span>
            <span>{money(tax)}</span>
          </div>
          <div className="grand">
            <span>Разом</span>
            <span>{money(total)}</span>
          </div>
          {estimate.deposit > 0 && (
            <div>
              <span>Необхідний депозит</span>
              <span>{money(deposit)}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
