import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";

// 📍 Нагадування власнику: «Ви приїхали до клієнта — почати облік часу?» і, коли поїхав, — скільки був на об'єкті.
// Зони (адреси активних проєктів) надсилає сайт; телефон сам помічає приїзд/від'їзд, навіть коли застосунок закритий.
export const OWNER_GEO_TASK = "qc-owner-geofence";
const SITES_KEY = "qc_owner_sites";
const STATE_KEY = "qc_owner_geo_state";
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export type OwnerSite = { id: string; lat: number; lng: number; radius: number; title: string };
type Sites = Record<string, string>;                                       // id зони → назва клієнта
type State = Record<string, { day: string; first: number; in: number; told: boolean; out?: number; done?: boolean }>;

async function read<T>(key: string, empty: T): Promise<T> {
  try { return JSON.parse((await SecureStore.getItemAsync(key, OPTS)) || "") as T; } catch { return empty; }
}
const write = (key: string, v: unknown) => SecureStore.setItemAsync(key, JSON.stringify(v), OPTS);
const hm = (ms: number) => new Date(ms).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

async function notify(title: string, body: string, sid: string) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, sound: "default", data: { url: `/?screen=pay&sid=${encodeURIComponent(sid)}` } }, trigger: null });
  } catch {}
}

TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(OWNER_GEO_TASK, async ({ data, error }) => {
  const id = data?.region?.identifier;
  if (error || !id) return;
  const sites = await read<Sites>(SITES_KEY, {});
  const title = sites[id];
  if (!title) return;
  const state = await read<State>(STATE_KEY, {});
  const now = Date.now();
  const day = new Date(now).toDateString();
  const cur = state[id] && state[id].day === day ? state[id] : null;
  if (data.eventType === Location.GeofencingEventType.Enter) {
    // раз на день на об'єкт: вийшов до машини й повернувся — вдруге не турбуємо
    const told = cur ? cur.told : false;
    state[id] = { day, first: cur ? cur.first : now, in: now, told: true, out: 0, done: cur ? cur.done : false };
    await write(STATE_KEY, state);
    if (!told) await notify(`📍 Ви на об'єкті: ${title}`, "Почати облік часу? Натисніть, щоб відкрити проєкт.", id);
  } else if (data.eventType === Location.GeofencingEventType.Exit) {
    if (!cur || !cur.in) return;
    const stayed = now - cur.in;
    state[id] = { ...cur, in: 0, out: now };
    await write(STATE_KEY, state);
    // коротка відлучка (до машини) або проїздом — мовчимо
    if (stayed < 30 * 60000) return;
    const hours = Math.round(((now - cur.first) / 3600000) * 4) / 4;
    await notify(`⏹ Ви поїхали: ${title}`, `На об'єкті з ${hm(cur.first)} до ${hm(now)} — приблизно ${hours} год. Записати години?`, id);
  }
});

/** Сайт надіслав список об'єктів → оновити зони. Порожній список — вимкнути. */
export async function syncOwnerGeofences(list: OwnerSite[]): Promise<void> {
  try {
    const sites = list.filter(s => s && typeof s.id === "string" && Number.isFinite(s.lat) && Number.isFinite(s.lng)).slice(0, 15);
    const running = await Location.hasStartedGeofencingAsync(OWNER_GEO_TASK);
    if (!sites.length) { if (running) await Location.stopGeofencingAsync(OWNER_GEO_TASK); await write(SITES_KEY, {}); return; }
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") return;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") return;
    const names: Sites = {};
    for (const s of sites) names[s.id] = String(s.title || "клієнт").slice(0, 40);
    // той самий список — зони вже стоять, не перезапускаємо (щоб не скидати стан «на об'єкті»)
    const sig = JSON.stringify(sites.map(s => [s.id, Math.round(s.lat * 1e5), Math.round(s.lng * 1e5), s.radius]));
    const prev = await read<{ sig?: string }>(SITES_KEY + "_sig", {});
    await write(SITES_KEY, names);
    if (running && prev.sig === sig) return;
    await Location.startGeofencingAsync(OWNER_GEO_TASK, sites.map(s => ({ identifier: s.id, latitude: s.lat, longitude: s.lng, radius: Math.min(400, Math.max(80, Number(s.radius) || 120)), notifyOnEnter: true, notifyOnExit: true })));
    await write(SITES_KEY + "_sig", { sig });
  } catch {}
}

export async function stopOwnerGeofences() {
  try { if (await Location.hasStartedGeofencingAsync(OWNER_GEO_TASK)) await Location.stopGeofencingAsync(OWNER_GEO_TASK); } catch {}
}

export type OnSite = { id: string; title: string; first: number; in: number; out: number };
/** Де власник сьогодні був / є зараз (для картки «⏱ Ви на об'єкті» на сайті). Записані чи сховані — не показуємо. */
export async function ownerOnSite(): Promise<OnSite[]> {
  const sites = await read<Sites>(SITES_KEY, {});
  const state = await read<State>(STATE_KEY, {});
  const day = new Date().toDateString();
  return Object.entries(state)
    .filter(([id, v]) => v && v.day === day && !v.done && sites[id] && (v.in > 0 || (v.out || 0) > 0))
    .map(([id, v]) => ({ id, title: sites[id], first: v.first, in: v.in, out: v.out || 0 }));
}
/** Години записано або картку сховали — більше не показувати сьогодні. */
export async function ownerSiteDone(id: string) {
  const state = await read<State>(STATE_KEY, {});
  if (!state[id]) return;
  state[id] = { ...state[id], done: true };
  await write(STATE_KEY, state);
}
