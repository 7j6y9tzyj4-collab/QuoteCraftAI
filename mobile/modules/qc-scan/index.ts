import { requireOptionalNativeModule } from "expo";

// Вбудований LiDAR-сканер кімнати (Apple RoomPlan). На Android і старих iPhone модуля немає — тоді null.
type QcScan = {
  isSupported(): boolean;
  /** відкриває сканер на весь екран; після «Готово» сам відправляє план у QuoteCraft за токеном заявки */
  scan(token: string, api: string): Promise<{ ok: boolean; message?: string }>;
};
const mod = requireOptionalNativeModule<QcScan>("QcScan");
export const scanSupported = (): boolean => { try { return !!mod && mod.isSupported(); } catch { return false; } };
export const scanRoom = (token: string, api: string) => mod ? mod.scan(token, api) : Promise.resolve({ ok: false, message: "unsupported" });
