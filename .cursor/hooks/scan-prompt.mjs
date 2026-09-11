import { collectStrings, readInput } from "./lib/stdin.mjs";

/**
 * Blokuje wyslanie promptu zawierajacego sekret, zeby nie trafil do historii czatu.
 * Tylko wzorce wysokiej pewnosci - falszywy alarm byloby tu drozszy niz przeoczenie.
 */
const PATTERNS = [
  { name: "klucz API OpenAI", regex: /\bsk-[A-Za-z0-9_-]{32,}/ },
  {
    name: "token JWT (anon lub service_role)",
    regex: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
  },
  { name: "klucz prywatny", regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const input = await readInput();
const text = collectStrings(input).join("\n");

const hit = PATTERNS.find(({ regex }) => regex.test(text));

if (hit) {
  console.error(
    `\n[hook] W promptcie wyglada na to, ze jest ${hit.name}. Usun go z wiadomosci - sekrety trzymamy w .env.local i w Supabase Vault.\n`,
  );
  process.exit(2);
}

process.exit(0);
