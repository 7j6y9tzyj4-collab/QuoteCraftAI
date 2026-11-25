import { requireOptionalNativeModule } from "expo";

// Вбудований LiDAR-сканер кімнати (Apple RoomPlan). На Android і старих iPhone модуля немає — тоді null.
type QcScan = {
  isSupported(): boolean;
  /** відкриває сканер на весь екран; після «Готово» сам відправляє план у QuoteCraft за токеном заявки */
  scan(token: string, api: string): Promise<{ ok: boolean; message?: string }>;
  /** сканер документів Apple: знаходить краї, вирівнює; сторінки — JPEG у base64 */
  scanDocument(): Promise<{ ok: boolean; message?: string; pages: string[] }>;
};
const mod = requireOptionalNativeModule<QcScan>("QcScan");
export const scanSupported = (): boolean => { try { return !!mod && mod.isSupported(); } catch { return false; } };
export const scanRoom = (token: string, api: string) => mod ? mod.scan(token, api) : Promise.resolve({ ok: false, message: "unsupported" });
export const docScanAvailable = (): boolean => !!mod && typeof mod.scanDocument === "function";
export const scanDocument = () => mod ? mod.scanDocument() : Promise.resolve({ ok: false, message: "unsupported", pages: [] as string[] });
