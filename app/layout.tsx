import "./globals.css";
import KeyboardGuard from "@/components/KeyboardGuard";
export const metadata = { title: "QuoteCraft AI", description: "Estimate faster. Win more jobs.", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: "QuoteCraft", statusBarStyle: "black" as const }, icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" } };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const, interactiveWidget: "resizes-content" as const };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="uk"><body><KeyboardGuard/>{children}</body></html>;
}
