import "./globals.css";
export const metadata = { title: "QuoteCraft AI", description: "Estimate faster. Win more jobs." };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="uk"><body>{children}</body></html>;
}
