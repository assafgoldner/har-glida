import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Helpful error during setup
  console.error(
    "חסרים משתני סביבה. צור קובץ .env עם VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
