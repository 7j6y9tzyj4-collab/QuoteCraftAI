import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { estimateTotals, itemTotal, itemMaterialRate, itemFinishRate } from "@/lib/estimateTotals";
import type { Estimate, Unit } from "@/lib/types";
import {PRELIMINARY_NOTE} from "@/lib/photoMeasurements";
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
          <h1>Estimate not found</h1>
          <p>This link is no longer valid.</p>
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
  const includeFinish = estimate.includeFinish !== false;
  const totals = estimateTotals(estimate.items, includeFinish);
  const subtotal = totals.subtotal;
  const discount = Math.min(subtotal, estimate.discount || 0);
  const tax = ((subtotal - discount) * (estimate.tax || 0)) / 100;
  const total = subtotal - discount + tax;
  const deposit = (total * (estimate.deposit || 0)) / 100;

  return (
    <main className="shared">
      <div className="sharedCard">
        <div className="sharedHead">
          <div>
            <span className="sharedEyebrow">K&amp;V HOUSE RENOVATION · ESTIMATE</span>
            <h1>{estimate.project || "Estimate"}</h1>
            {estimate.preliminary&&<><p><strong>{PRELIMINARY_NOTE}</strong></p><p style={{whiteSpace:"pre-wrap"}}>{estimate.measurementNotes}</p></>}
            {estimate.client && <p>Client: {estimate.client}</p>}
            {estimate.address && <p>{estimate.address}</p>}
          </div>
          <PrintButton />
        </div>

        <table className="sharedTable">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
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
                <td>{money(item.unitPrice)}{itemMaterialRate(item) > 0 ? ` + ${money(itemMaterialRate(item))} materials` : ""}{includeFinish && itemFinishRate(item) > 0 ? ` + ${money(itemFinishRate(item))} finish` : ""}</td>
                <td>{money(itemTotal(item, includeFinish))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sharedTotals">
          {(totals.materials > 0 || totals.finish > 0) && (<><div><span>Labor</span><span>{money(totals.labor)}</span></div><div><span>Materials</span><span>{money(totals.materials)}</span></div>{totals.finish > 0 && <div><span>Finish allowance (basic grade)</span><span>{money(totals.finish)}</span></div>}</>)}
          <div>
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div>
            <span>Discount</span>
            <span>−{money(discount)}</span>
          </div>
          <div>
            <span>Tax</span>
            <span>{money(tax)}</span>
          </div>
          <div className="grand">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
          {estimate.deposit > 0 && (
            <div>
              <span>Deposit required</span>
              <span>{money(deposit)}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
