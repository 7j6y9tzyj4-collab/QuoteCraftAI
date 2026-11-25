import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

// Справжні сповіщення iPhone (APNs через Expo). Сайт у WebView просить: "qc:push:status" / "qc:push:on",
// застосунок відповідає подією "qc-push" {granted, denied, token}; сайт зберігає токен за власником.
export type PushState = { granted: boolean; denied: boolean; token: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const projectId = (): string => String((Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId || "");

async function token(): Promise<string> {
  try { return (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data || ""; } catch { return ""; }
}
export async function pushStatus(): Promise<PushState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return { granted: true, denied: false, token: await token() };
    return { granted: false, denied: !p.canAskAgain, token: "" };
  } catch { return { granted: false, denied: false, token: "" }; }
}
export async function pushEnable(): Promise<PushState> {
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: true } });
    if (!p.granted) return { granted: false, denied: true, token: "" };
    return { granted: true, denied: false, token: await token() };
  } catch { return { granted: false, denied: false, token: "" }; }
}
/** куди вести після натискання на сповіщення (шлях на сайті) */
const urlOf = (r: Notifications.NotificationResponse | null): string => {
  const u = r?.notification.request.content.data?.url;
  return typeof u === "string" && u.startsWith("/") ? u : "";
};
export function onPushOpen(go: (path: string) => void): () => void {
  try { const first = urlOf(Notifications.getLastNotificationResponse()); if (first) go(first); } catch {}
  const sub = Notifications.addNotificationResponseReceivedListener(r => { const u = urlOf(r); if (u) go(u); });
  return () => sub.remove();
}
