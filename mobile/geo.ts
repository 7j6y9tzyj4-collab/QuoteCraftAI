import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";

// 📍 Геозони об'єктів: телефон сам помічає «зайшов / вийшов» і шле на сервер — години рахуються без кнопок.
export const BASE = "https://quotecraftai-app.vercel.app";
export const GEO_TASK = "qc-geofence";
const TOKEN_KEY = "qc_worker_token";
const QUEUE_KEY = "qc_geo_queue";
// доступно у фоні після першого розблокування телефона
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const getToken = () => SecureStore.getItemAsync(TOKEN_KEY, OPTS);
export const setToken = (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t, OPTS);
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY, OPTS);

type GeoEvent = { id: string; event: "enter" | "exit"; at: string };

async function readQueue(): Promise<GeoEvent[]> {
  try { return JSON.parse((await SecureStore.getItemAsync(QUEUE_KEY, OPTS)) || "[]"); } catch { return []; }
}
const writeQueue = (q: GeoEvent[]) => SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(q.slice(-40)), OPTS);

/** Надіслати події (спершу ті, що не дійшли раніше — напр. не було інтернету в підвалі). */
export async function flushEvents(extra?: GeoEvent) {
  const token = await getToken();
  if (!token) return;
  const q = await readQueue();
  if (extra) q.push(extra);
  const left: GeoEvent[] = [];
  for (let i = 0; i < q.length; i++) {
    try {
      const r = await fetch(`${BASE}/api/worker-geo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...q[i] }) });
      // 4xx — подія не підходить (старе посилання тощо): не повторюємо; 5xx / мережа — лишаємо в черзі
      if (r.status >= 500) { left.push(...q.slice(i)); break; }
    } catch { left.push(...q.slice(i)); break; }
  }
  await writeQueue(left);
}

TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(GEO_TASK, async ({ data, error }) => {
  if (error || !data?.region?.identifier) return;
  const event = data.eventType === Location.GeofencingEventType.Enter ? "enter" : data.eventType === Location.GeofencingEventType.Exit ? "exit" : null;
  if (!event) return;
  await flushEvents({ id: data.region.identifier, event, at: new Date().toISOString() });
});

export type GeoStatus = "on" | "no-permission" | "no-sites" | "error";

/** Оновити список зон із сервера (об'єкти помічника) і ввімкнути стеження за входом/виходом. */
export async function syncGeofences(): Promise<GeoStatus> {
  try {
    const token = await getToken();
    if (!token) return "error";
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") return "no-permission";
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") return "no-permission";
    const r = await fetch(`${BASE}/api/worker-geo?token=${encodeURIComponent(token)}`);
    if (!r.ok) return "error";
    const j = (await r.json()) as { regions?: { id: string; lat: number; lng: number; radius: number }[] };
    const regions = (j.regions || []).slice(0, 20).map(x => ({ identifier: x.id, latitude: x.lat, longitude: x.lng, radius: x.radius, notifyOnEnter: true, notifyOnExit: true }));
    if (!regions.length) {
      if (await Location.hasStartedGeofencingAsync(GEO_TASK)) await Location.stopGeofencingAsync(GEO_TASK);
      return "no-sites";
    }
    await Location.startGeofencingAsync(GEO_TASK, regions);
    await flushEvents();
    return "on";
  } catch { return "error"; }
}

export async function stopGeofences() {
  try { if (await Location.hasStartedGeofencingAsync(GEO_TASK)) await Location.stopGeofencingAsync(GEO_TASK); } catch {}
}
