import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the Supabase service role key to bypass RLS for
// the public "shared estimate" read (the client never sees this key).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Supabase service role environment variables are missing.");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});
