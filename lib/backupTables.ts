// Що входить у резервну копію QuoteCraft (усі таблиці мають колонку user_id).
export const BACKUP_TABLES=["user_prices","user_calc_prices","user_calc_estimates","user_statements","shared_quotes","user_note_templates","estimates","site_leads"] as const;
// необов'язкові: якщо таблиці ще немає — пропускаємо, а не ламаємо всю копію
export const OPTIONAL_TABLES=new Set<string>(["site_leads","user_calc_estimates","user_note_templates","shared_quotes"]);

// шляхи фото у bucket receipts (чеки з Оплат + фото заявок із сайту)
export function photoPathsOf(tables:Record<string,any[]>):string[]{
  const out=new Set<string>();
  for(const row of tables.user_statements||[])for(const s of (row?.statements||[]))for(const r of (s?.receipts||[]))if(r?.photoPath)out.add(String(r.photoPath));
  for(const row of tables.site_leads||[])for(const p of (row?.photos||[]))if(p)out.add(String(p));
  return [...out];
}

export const chicagoDate=(d=new Date())=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Chicago"}).format(d); // YYYY-MM-DD
