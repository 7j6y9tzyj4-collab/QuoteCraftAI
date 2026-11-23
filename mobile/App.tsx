import { useCallback, useEffect, useState, type ComponentType } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { WebView as RNWebView, type WebViewProps } from "react-native-webview";
// типи бібліотеки зводять пропси до never без параметра — задаємо явно
const WebView = RNWebView as unknown as ComponentType<WebViewProps>;
import { BASE, clearToken, getToken, setToken, stopGeofences, syncGeofences, type GeoStatus } from "./geo";

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
  async function signOut() { await stopGeofences(); await clearToken(); await SecureStore.deleteItemAsync(MODE_KEY); setTok(""); setGeo(null); setMode(null); }

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

  const uri = mode === "worker" ? `${BASE}/w/${token}?app=1` : `${BASE}/?app=1`;
  const banner = mode === "worker" && geo && geo !== "on" ? (
    geo === "no-permission" ? { t: "📍 Щоб години рахувались самі, дозволь доступ до місця «Завжди».", a: "Відкрити налаштування", f: () => Linking.openSettings() }
      : geo === "no-sites" ? { t: "📍 Поки немає об'єктів з адресою — години записуй кнопкою.", a: "Оновити", f: refreshGeo }
        : { t: "📍 Не вдалося оновити зони об'єктів (нема інтернету?).", a: "Спробувати ще", f: refreshGeo }) : null;

  return <SafeAreaView style={s.wrap}><StatusBar style="dark" />
    {banner && <View style={s.banner}><Text style={s.bannerT}>{banner.t}</Text><Pressable onPress={banner.f}><Text style={s.bannerA}>{banner.a}</Text></Pressable></View>}
    <WebView source={{ uri }} style={{ flex: 1 }}
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
      onMessage={e => { if (e.nativeEvent.data === "qc:signout") signOut(); if (e.nativeEvent.data === "qc:geo") refreshGeo(); }}
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
