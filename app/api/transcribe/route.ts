import OpenAI from "openai";
import {aiGuard} from "@/lib/aiGuard";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";



// Fallback transcription for browsers where the Web Speech API is missing or
// unreliable (Safari on iOS and macOS). The client records audio with
// MediaRecorder and uploads it here; Whisper handles Ukrainian reliably.
export async function POST(req: NextRequest) {
  // mode=meeting — фрагмент запису розмови з клієнтом (до ~3 хв): мова визначається автоматично
  const meeting=req.nextUrl.searchParams.get("mode")==="meeting";
  const _ai=await aiGuard(req,meeting?"meeting-audio":"transcribe",meeting?0.02:0.006);if(!_ai.ok)return _ai.res;
  try {
    if(!process.env.OPENAI_API_KEY){
      return NextResponse.json({error:"Голосове розпізнавання ще не налаштоване на сервері."},{status:503});
    }
    const openai = new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const form = await req.formData();
    const file = form.get("audio");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Аудіо не отримано." }, { status: 400 });
    }

    if (meeting) {
      if (file.size > 4.2 * 1024 * 1024) return NextResponse.json({ error: "Фрагмент запису завеликий." }, { status: 400 });
      if (file.size < 1500) return NextResponse.json({ text: "" });
      // 🗣 хто говорить: модель з розділенням мовців (мітки A, B… — свої в кожному фрагменті). Не вийшло — звичайний Whisper.
      if (process.env.MEETING_DIARIZE !== "off") {
        try {
          const f = new FormData();
          f.append("file", file);
          f.append("model", "gpt-4o-transcribe-diarize");
          f.append("response_format", "diarized_json");
          f.append("chunking_strategy", "auto");
          const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: f });
          const d = await r.json().catch(() => null);
          const segs: { speaker?: string; text?: string }[] = Array.isArray(d?.segments) ? d.segments : [];
          if (r.ok && segs.length) {
            const turns: { s: string; t: string }[] = [];
            for (const g of segs) {
              const s = String(g.speaker || "?").replace(/[^A-Za-z0-9_]/g, "").slice(0, 12) || "?";
              const t = String(g.text || "").trim();
              if (!t) continue;
              const last = turns[turns.length - 1];
              if (last && last.s === s) last.t += " " + t; else turns.push({ s, t });
            }
            return NextResponse.json({ text: turns.map(x => x.t).join(" "), turns });
          }
          console.warn("diarize failed", r.status, JSON.stringify(d)?.slice(0, 300));
        } catch (e) { console.warn("diarize error", e); }
      }
      const tr = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        prompt: "Home renovation site visit: contractor and client. Bathroom, shower, tub, vanity, tile, grout, drywall, baseboard, crown molding, closet, pantry, basement, backsplash, niche, sq ft, inches, estimate, deposit. Розмова може бути українською: ванна, душ врівень з підлогою, без порогу, з порогом, плитка, умивальник, унітаз, підлога, стеля, вентилятор, дзеркало, фарбування, фути, дюйми.",
      });
      return NextResponse.json({ text: tr.text || "" });
    }

    if (file.size > 3 * 1024 * 1024) {
      return NextResponse.json({ error: "Запис завеликий. Запиши коротший фрагмент." }, { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "uk",
      prompt: "Ремонт: клазет, клозет, closet, бейсмент, basement, шуз, shoe molding, drywall, shower pan, vanity, backsplash, тубайфори, 2x4, плитка, фут, square feet, дюйм, inch.",
    });

    return NextResponse.json({ text: transcription.text || "" });
  } catch (error) {
    console.error("transcribe error", error);
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
