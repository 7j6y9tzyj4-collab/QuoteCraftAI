# Заявки з сайту → QuoteCraft

Форма «Free inspection» на kvhouserenovation.com (send-inspection.php) шле кожну заявку
сюди. У QuoteCraft вона з'являється на Home у блоці «Заявки з сайту»: ім'я, телефон
(кнопки дзвінок/SMS), адреса (Google Maps), опис, відповіді калькулятора, до 4 фото,
статус Нова → Зв'язався → Огляд призначено → Закрита.

## Файли
- `app/api/site-lead/route.ts` — приймає заявку (POST, `Authorization: Bearer <секрет>`).
- `components/SiteLeads.tsx` — блок на Home.
- `../Supabase/site-leads.sql` — таблиця `site_leads` (запустити один раз).
- Фото лежать у bucket `receipts`, папка `<user_id>/site-leads/<id>/`.

## Налаштування (один раз)
1. Supabase → SQL Editor → нова вкладка → `site-leads.sql` → Run. Скопіюй свій `id`.
2. Vercel → Settings → Environment Variables:
   - `SITE_LEAD_SECRET` — довгий секрет (той самий, що на сайті);
   - `SITE_LEAD_USER_ID` — id з кроку 1.
   Потім Redeploy.
3. На хостингу сайту в `config.php`:
   - `'quotecraft_lead_url' => 'https://quotecraftai-app.vercel.app/api/site-lead'`
   - `'quotecraft_lead_secret' => '<той самий секрет>'`

Секрет не комітити в GitHub. Лист на пошту приходить незалежно від QuoteCraft.
