# Пакет чеків + щоденний бекап — як залити (10.10.2026, Claude)

SQL **не потрібен** — нові поля чеків лежать у тому ж JSON, що й раніше.

## 1. Vercel → Settings → Environment Variables
Додай **CRON_SECRET** — будь-який довгий випадковий рядок (мінімум 16 символів), напр. з Terminal:
```
openssl rand -hex 24
```
(SUPABASE_SERVICE_ROLE_KEY уже є — він потрібен бекапу.)

## 2. Terminal
```
cd ~/Desktop/"Claude outputs"/QuoteCraft/QuoteCraftAI_GitHub_Ready
rm -f .git/HEAD.lock .git/index.lock .git/ORIG_HEAD.lock
git add app/api/parse-receipt/route.ts app/api/cron/backup/route.ts components/PaymentsScreen.tsx components/ReceiptBatch.tsx components/BackupPanel.tsx components/QuoteCraftApp.tsx lib/receiptFile.ts lib/receiptBatch.ts lib/statement.ts lib/statementPdf.ts lib/backupTables.ts vercel.json UPDATE_RECEIPTS_BACKUP_UK.md
git commit -m "Receipt batch upload (PDF split per page, duplicates, review), receipts PDF, nightly backup"
git push
```

## 3. Перевірка бекапу одразу (не чекаючи ночі)
```
curl -H "Authorization: Bearer ТВІЙ_CRON_SECRET" https://quotecraftai-app.vercel.app/api/cron/backup
```
Має відповісти `"ok":true` і кількості по таблицях. Копія з'явиться в Supabase → Storage → bucket **backups** → папка твого акаунта → `YYYY-MM-DD.json`, фото чеків — у `receipts/`.
Далі Vercel запускає це сам щоночі (~2–3 ночі за Чикаго).

## Що нового
**Оплати → проєкт → «📦 Пакет чеків (фото / PDF)»** (або перетягни файли в розділ чеків на Маку)
- PDF з Нотаток: кожна сторінка = окремий чек. Довгий чек на 2 сторінки — «⤒ З'єднати з попереднім».
- AI читає всі (по 3 одночасно), прогрес-бар. Таблиця: можна виправити дату / магазин / суму / що купив, зняти галочку.
- Дублікати (той самий магазин + дата + сума, або той самий номер чека, або той самий файл) — жовті, без галочки: «N пропущено — вже є». Постав галочку — додасться все одно.
- «Додати всі (N) · $сума» — тільки тоді фото йдуть у сховище і чеки в проєкт.

**Оплати (головна) → «📦 Пакет»** або перетягни файли на список
- Проєкт шукається за назвою файлу: «Uzma.pdf» → розрахунок з клієнтом Uzma. Не знайшов / кілька схожих — вибираєш у списку (або «＋ Новий проєкт «Uzma»»).

**«📥 Скачати всі чеки проєкту (PDF)»** — внизу проєкту: один чек на сторінку + підсумок. На iPhone відкривається «Поділитись» → «Зберегти у Файли».

**Prices → ACCOUNT → «⬇ Скачати резервну копію»** — JSON з усіма даними (ціни, естімейти, Оплати, посилання, шаблони, заявки). Відновлення — тільки вручну, з твого дозволу.

Швидкі кнопки «📷 Сфотографувати чек» і «📋 Скріншот» працюють як раніше (по одному чеку, одразу).
