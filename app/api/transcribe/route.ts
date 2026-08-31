import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Fallback transcription for browsers where the Web Speech API is missing or
// unreliable (Safari on iOS and macOS). The client records audio with
// MediaRecorder and uploads it here; Whisper handles Ukrainian reliably.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("audio");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Аудіо не отримано." }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Аудіофайл завеликий." }, { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "uk",
    });

    return NextResponse.json({ text: transcription.text || "" });
  } catch (error) {
    console.error("transcribe error", error);
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
