import { json } from "./_lib.mjs";

export default async () => json({
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  siteName: process.env.SITE_NAME || "Saber Espiritual"
});
