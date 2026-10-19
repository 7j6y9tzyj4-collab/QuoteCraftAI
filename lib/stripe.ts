// Мінімальний Stripe-клієнт через REST (без SDK): Checkout Session для завдатку.
const API="https://api.stripe.com/v1";

function form(obj:Record<string,string|number>){
  const p=new URLSearchParams();
  for(const [k,v] of Object.entries(obj))p.append(k,String(v));
  return p;
}

export async function createDepositCheckout(key:string,o:{amountCents:number;title:string;description:string;email?:string;successUrl:string;cancelUrl:string;token:string}){
  const body:Record<string,string|number>={
    mode:"payment",
    "line_items[0][quantity]":1,
    "line_items[0][price_data][currency]":"usd",
    "line_items[0][price_data][unit_amount]":o.amountCents,
    "line_items[0][price_data][product_data][name]":o.title.slice(0,250),
    "line_items[0][price_data][product_data][description]":o.description.slice(0,500)||"Deposit",
    success_url:o.successUrl,
    cancel_url:o.cancelUrl,
    "metadata[quote_token]":o.token,
    "payment_intent_data[metadata][quote_token]":o.token,
  };
  if(o.email)body.customer_email=o.email;
  const r=await fetch(`${API}/checkout/sessions`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},body:form(body)});
  const d=await r.json();
  if(!r.ok)throw new Error(d?.error?.message||`Stripe ${r.status}`);
  return d as {id:string;url:string};
}

export async function getCheckout(key:string,id:string){
  const r=await fetch(`${API}/checkout/sessions/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${key}`}});
  const d=await r.json();
  if(!r.ok)throw new Error(d?.error?.message||`Stripe ${r.status}`);
  return d as {id:string;payment_status:string;amount_total:number;metadata?:Record<string,string>};
}
