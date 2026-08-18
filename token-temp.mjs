import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: m } = await admin.from("league_members").select("player_id, league_id, display_name").eq("role","admin").limit(1).single();
const t = await new SignJWT({ role:"authenticated", league_id:m.league_id, display_name:m.display_name, is_admin:true })
  .setProtectedHeader({alg:"HS256",typ:"JWT"}).setSubject(m.player_id).setAudience("authenticated")
  .setIssuedAt().setExpirationTime("30m").sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
console.log(t);
