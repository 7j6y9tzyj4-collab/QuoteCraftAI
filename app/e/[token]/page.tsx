import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Estimate, Unit } from "@/lib/types";
import {PRELIMINARY_NOTE} from "@/lib/photoMeasurements";
import {estimateAmounts,lineAmounts} from "@/lib/estimateMath";
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
  const amounts=estimateAmounts(estimate);
  const {subtotal,discount,tax,total,deposit}=amounts;

  return (
    <main className="shared">
      <div className="sharedCard">
        <div className="sharedHead">
          <div>
            <span className="sharedEyebrow">ESTIMATE</span>
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
                  {item.laborScope&&<div className="sharedNote">{item.laborScope}</div>}
                  {item.materialNote&&!item.customerMaterials&&<div className="sharedNote">Матеріали: {item.materialNote}</div>}
                </td>
                <td>
                  {item.quantity} {unitLabel(item.unit)}
                </td>
                <td>{money(item.unitPrice)} робота<br/>{item.customerMaterials?"Матеріали клієнта":item.materialStatus==="unknown"?"Матеріали не оцінено":`${money(item.materialRate??0)} матеріали${item.materialStatus==="partial"?" (частина комплекту)":""}`}</td>
                <td>{money(lineAmounts(item).total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {amounts.unknown>0&&<p>ПОПЕРЕДНІЙ ПІДСУМОК: матеріали для {amounts.unknown} позицій оцінено не повністю. Включено лише відому частину.</p>}
        <div className="sharedTotals">
          <div><span>Робота</span><span>{money(amounts.labor)}</span></div>
          <div><span>Оцінені матеріали</span><span>{money(amounts.materials)}</span></div>
          <div><span>Діапазон до знижки й податку</span><span>{money(amounts.min)}–{money(amounts.max)}</span></div>
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
