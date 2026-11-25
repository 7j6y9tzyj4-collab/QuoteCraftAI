# QuoteCraft — застосунок для телефона

Оболонка: усі екрани підтягуються із сайту (оновлюються без App Store). Застосунок додає геозони об'єктів
для помічника: телефон сам повідомляє «зайшов / вийшов», години рахуються без кнопок (`/api/worker-geo`).

Перший запуск (один раз, на Mac власника, у Терміналі):

    cd mobile
    npm install
    npx eas-cli@latest login
    npx eas-cli@latest build -p ios --auto-submit

Далі збірки йдуть самі з GitHub (секрет `EXPO_TOKEN`), коли змінюється папка `mobile/`.

LiDAR-сканер кімнати вбудований (`modules/qc-scan`, Apple RoomPlan, iOS 17+): кнопка «📡 Сканувати LiDAR» на сайті
шле `qc:scan:<token>` у застосунок, той відкриває сканер і сам відправляє план на `/api/scan-import`.
Після змін у `modules/` чи `app.json` потрібна нова збірка (`eas build`), зміни сайту — ні.

Також у `modules/qc-scan`: сканер документів Apple (`scanDocument`, кнопка «📷 Чек» на сайті шле `qc:docscan:<id>`).
`ownerGeo.ts` — геозони власника: сайт шле `qc:ownergeo:[…]` (з `/api/owner-geo`), застосунок нагадує про приїзд/від'їзд локальним сповіщенням.
`push.ts` — сповіщення (Expo push); токен зберігає сайт через `/api/push {expoToken}`.
