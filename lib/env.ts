/**
 * Dostep do zmiennych srodowiskowych z jasnym bledem, gdy czegos brakuje.
 *
 * Zmienne NEXT_PUBLIC_* czytamy bezposrednio w miejscu uzycia, bo Next wstawia
 * ich wartosci na etapie budowania tylko przy statycznym odwolaniu.
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Brak zmiennej srodowiskowej ${name}. Skopiuj .env.example do .env.local i uzupelnij.`,
    );
  }

  return value;
}

export function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function siteUrl(): string {
  return requireEnv("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL);
}
