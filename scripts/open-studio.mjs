import { isSupabaseRunning, run } from "./lib/run.mjs";

const STUDIO_URL = "http://127.0.0.1:54323";

if (!isSupabaseRunning()) {
  console.log("Lokalny Supabase nie dziala. Uruchom: npm run db:start");
  process.exit(1);
}

console.log(`Supabase Studio: ${STUDIO_URL}`);
run(process.platform === "win32" ? "start" : "open", [STUDIO_URL]);
