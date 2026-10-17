# QuoteCraft Scan (iOS, LiDAR)

Міні-додаток: сканує кімнату через Apple RoomPlan і відправляє стіни/двері/вікна/об'єкти в QuoteCraft.

Збірка (Mac):
1. Xcode з App Store.
2. Відкрити `ios/QuoteCraftScan/QuoteCraftScan.xcodeproj` (готовий; `project.yml` — для xcodegen, якщо захочеться перегенерувати).
3. Xcode → Signing & Capabilities → Team: свій Apple ID. Підключити iPhone кабелем, обрати його, ▶︎ Run.
4. На iPhone: Settings → General → VPN & Device Management → довірити розробнику (один раз).

Безкоштовний Apple ID: додаток живе 7 днів, потім ще раз ▶︎ Run. Apple Developer ($99/рік) — без обмеження.

Потік: QuoteCraft → кімната огляду → «📡 Сканувати LiDAR» → відкривається цей додаток → сканування → «📤 Відправити» → у QuoteCraft розміри, прорізи і сантехніка з'являються самі (таблиця `scan_inbox`, API `/api/scan-import`).
