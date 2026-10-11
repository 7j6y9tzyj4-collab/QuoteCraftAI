import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
// Версія сайту (коміт на Vercel) — програма порівнює й пропонує «🔄 Оновити», коли вийшла нова.
export function GET(){
  return NextResponse.json({v:process.env.VERCEL_GIT_COMMIT_SHA||process.env.VERCEL_DEPLOYMENT_ID||"dev"},{headers:{"Cache-Control":"no-store"}});
}
