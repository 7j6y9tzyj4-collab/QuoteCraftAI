import "./globals.css";
import KeyboardGuard from "@/components/KeyboardGuard";
export const metadata = { title: "QuoteCraft AI", description: "Estimate faster. Win more jobs." };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const, interactiveWidget: "resizes-content" as const };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="uk"><body><KeyboardGuard/>{children}</body></html>;
}
