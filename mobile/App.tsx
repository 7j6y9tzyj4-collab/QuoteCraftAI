import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { WebView as RNWebView, type WebViewProps } from "react-native-webview";
// типи бібліотеки зводять пропси до never без параметра — задаємо явно
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: unknown }>;
import { BASE, clearToken, getToken, setToken, stopGeofences, syncGeofences, type GeoStatus } from "./geo";
import { docScanAvailable, scanDocument, scanRoom, scanSupported } from "./modules/qc-scan";
import { stopOwnerGeofences, syncOwnerGeofences, type OwnerSite } from "./ownerGeo";
import { onPushOpen, pushEnable, pushStatus, type PushState } from "./push";

// сайт дізнається, що LiDAR-сканер вбудований у застосунок (iPhone з LiDAR), і не просить відкривати QuoteCraft Scan
const NATIVE_FLAGS = `window.__QC_NATIVE_SCAN=${scanSupported() ? "true" : "false"};window.__QC_NATIVE_PUSH=true;window.__QC_NATIVE_DOCSCAN=${docScanAvailable() ? "true" : "false"};window.__QC_NATIVE_OWNERGEO=true;true;`;

// QuoteCraft на телефоні: всі екрани — це сайт (оновлюється без App Store),
// а застосунок додає те, чого сайт не вміє: геозони об'єктів для помічника.
type Mode = "owner" | "worker" | null;
const MODE_KEY = "qc_mode";
const tokenFrom = (s: string) => (s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [""])[0];

export default function App() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [token, setTok] = useState("");
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const [geo, setGeo] = useState<GeoStatus | null>(null);
  const web = useRef<{ injectJavaScript(js: string): void } | null>(null);
  const scanning = useRef(false);
  const [start, setStart] = useState("");

  useEffect(() => { (async () => {
    const m = (await SecureStore.getItemAsync(MODE_KEY)) as Mode;
    const t = (await getToken()) || "";
    if (m === "worker" && t) { setTok(t); setMode("worker"); }
    else if (m === "owner") setMode("owner");
    setReady(true);
  })(); }, []);

  const refreshGeo = useCallback(async () => { setGeo(await syncGeofences()); }, []);
  // помічник: зони оновлюються при запуску і щоразу, коли застосунок відкривають
  useEffect(() => {
    if (mode !== "worker") return;
    refreshGeo();
    const sub = AppState.addEventListener("change", s => { if (s === "active") refreshGeo(); });
    return () => sub.remove();
  }, [mode, refreshGeo]);

  async function asOwner() { await SecureStore.setItemAsync(MODE_KEY, "owner"); setMode("owner"); }
  async function asWorker() {
    const t = tokenFrom(link);
    if (!t) { setErr("Встав посилання на свій кабінет (його надсилає власник)."); return; }
    await setToken(t); await SecureStore.setItemAsync(MODE_KEY, "worker"); setTok(t); setErr(""); setMode("worker");
  }
  async function signOut() { await stopGeofences(); await stopOwnerGeofences(); await clearToken(); await SecureStore.deleteItemAsync(MODE_KEY); setTok(""); setGeo(null); setMode(null); }

  // «📡 Сканувати LiDAR» на сайті → вбудований сканер; результат відправляється на сервер, сайт забирає його сам
  async function startScan(tok: string) {
    if (!/^[0-9a-f]{32}$/.test(tok) || scanning.current) return;
    scanning.current = true;
    let r: { ok: boolean; message?: string } = { ok: false, message: "error" };
    try { r = await scanRoom(tok, BASE); } catch (e) { r = { ok: false, message: e instanceof Error ? e.message : String(e) }; }
    scanning.current = false;
    web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("qc-scan-done",{detail:${JSON.stringify({ token: tok, ok: r.ok, message: r.message || "" })}}));true;`);
  }

  // «📷 Чек» на сайті → сканер документів Apple (сам обрізає краї); сторінки повертаються на сайт як фото
  async function startDocScan(reqId: string) {
    if (!/^[a-z0-9]{6,20}$/.test(reqId) || scanning.current) return;
    scanning.current = true;
    let r: { ok: boolean; message?: string; pages: string[] } = { ok: false, message: "error", pages: [] };
    try { r = await scanDocument(); } catch (e) { r = { ok: false, message: e instanceof Error ? e.message : String(e), pages: [] }; }
    scanning.current = false;
    web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("qc-docscan",{detail:${JSON.stringify({ id: reqId, ok: r.ok, message: r.message || "", pages: r.pages || [] })}}));true;`);
  }

  const tellPush = (st: PushState) => web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("qc-push",{detail:${JSON.stringify(st)}}));true;`);
  // натиснули на сповіщення → відкриваємо потрібний екран сайту
  useEffect(() => {
    if (mode !== "owner") return;
    return onPushOpen(path => setStart(path + (path.includes("?") ? "&" : "?") + "app=1&t=" + Date.now()));
  }, [mode]);

  if (!ready) return <View style={s.center}><ActivityIndicator /></View>;

  if (!mode) return <SafeAreaView style={s.wrap}><StatusBar style="dark" />
    <View style={s.box}>
      <Text style={s.h1}>QuoteCraft</Text>
      <Pressable style={s.primary} onPress={asOwner}><Text style={s.primaryT}>Я власник — увійти</Text></Pressable>
      <Text style={s.or}>або</Text>
      <Text style={s.label}>Я помічник — посилання на мій кабінет:</Text>
      <TextInput style={s.input} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder="https://quotecraftai-app.vercel.app/w/…" />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Pressable style={s.secondary} onPress={asWorker}><Text style={s.secondaryT}>Відкрити кабінет</Text></Pressable>
    </View>
  </SafeAreaView>;

  const uri = mode === "worker" ? `${BASE}/w/${token}?app=1` : start ? BASE + start : `${BASE}/?app=1`;
  const banner = mode === "worker" && geo && geo !== "on" ? (
    geo === "no-permission" ? { t: "📍 Щоб години рахувались самі, дозволь доступ до місця «Завжди».", a: "Відкрити налаштування", f: () => Linking.openSettings() }
      : geo === "no-sites" ? { t: "📍 Поки немає об'єктів з адресою — години записуй кнопкою.", a: "Оновити", f: refreshGeo }
        : { t: "📍 Не вдалося оновити зони об'єктів (нема інтернету?).", a: "Спробувати ще", f: refreshGeo }) : null;

  return <SafeAreaView style={s.wrap}><StatusBar style="dark" />
    {banner && <View style={s.banner}><Text style={s.bannerT}>{banner.t}</Text><Pressable onPress={banner.f}><Text style={s.bannerA}>{banner.a}</Text></Pressable></View>}
    <WebView ref={web} source={{ uri }} style={{ flex: 1 }}
      originWhitelist={["https://*"]}
      geolocationEnabled javaScriptEnabled domStorageEnabled
      sharedCookiesEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      pullToRefreshEnabled allowsBackForwardNavigationGestures
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={req => {
        // телефон, пошта, карти, SMS та чужі сайти — відкриваємо поза застосунком
        const u = req.url;
        if (u.startsWith(BASE) || u.startsWith("about:") || u.startsWith("blob:") || u.startsWith("data:")) return true;
        if (/^https:\/\/[a-z0-9-]+\.supabase\.co\//i.test(u)) return true;
        Linking.openURL(u).catch(() => {});
        return false;
      }}
      injectedJavaScriptBeforeContentLoaded={NATIVE_FLAGS}
      onMessage={e => {
        const d = e.nativeEvent.data;
        if (d === "qc:signout") signOut();
        else if (d === "qc:geo") refreshGeo();
        else if (d.startsWith("qc:scan:") && e.nativeEvent.url.startsWith(BASE)) startScan(d.slice(8));
        else if (d.startsWith("qc:docscan:") && e.nativeEvent.url.startsWith(BASE)) startDocScan(d.slice(11));
        else if (d.startsWith("qc:ownergeo:") && mode === "owner" && e.nativeEvent.url.startsWith(BASE)) { try { void syncOwnerGeofences(JSON.parse(d.slice(12)) as OwnerSite[]); } catch {} }
        else if (d === "qc:push:status") pushStatus().then(tellPush);
        else if (d === "qc:push:on") pushEnable().then(tellPush);
      }}
      renderLoading={() => <View style={s.center}><ActivityIndicator /></View>} startInLoadingState />
    <Pressable onLongPress={signOut} delayLongPress={1500} style={s.foot}><Text style={s.footT}>{mode === "worker" ? (geo === "on" ? "📍 Години рахуються автоматично" : "QuoteCraft") : "QuoteCraft"} · утримуй, щоб вийти з режиму</Text></Pressable>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#f2f2f7" }, center: { flex: 1, alignItems: "center", justifyContent: "center" },
  box: { flex: 1, justifyContent: "center", padding: 24, gap: 10 },
  h1: { fontSize: 34, fontWeight: "800", marginBottom: 16, textAlign: "center" },
  primary: { backgroundColor: "#2f6df6", borderRadius: 14, padding: 16, alignItems: "center" }, primaryT: { color: "#fff", fontSize: 17, fontWeight: "700" },
  secondary: { backgroundColor: "#079455", borderRadius: 14, padding: 16, alignItems: "center" }, secondaryT: { color: "#fff", fontSize: 17, fontWeight: "700" },
  or: { textAlign: "center", color: "#8e8e93", marginVertical: 8 }, label: { fontSize: 15, fontWeight: "600" },
  input: { backgroundColor: "#fff", borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: "#d0d5dd" },
  err: { color: "#b42318" },
  banner: { backgroundColor: "#fffaeb", borderBottomWidth: 1, borderColor: "#fedf89", padding: 10, gap: 4 }, bannerT: { fontSize: 14 }, bannerA: { color: "#2f6df6", fontWeight: "700" },
  foot: { paddingVertical: 4, alignItems: "center" }, footT: { fontSize: 11, color: "#8e8e93" },
});
