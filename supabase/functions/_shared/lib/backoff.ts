/**
 * Backoff kolejki.
 *
 * Odpowiednik funkcji fail_job z migracji 0012:
 *   next_run_at = now() + interval '30 seconds' * power(2, attempts)
 *
 * `attempts` to liczba prob wykonanych do tej pory - claim_jobs zwieksza ja
 * przed uruchomieniem handlera, wiec pierwsza porazka daje 60 sekund, druga 120.
 * Obie implementacje musza dawac ten sam wynik.
 */

export const BASE_DELAY_MS = 30_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export function computeBackoffMs(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 0) {
    throw new RangeError(`attempts musi byc nieujemna liczba calkowita, otrzymano ${attempts}`);
  }

  return BASE_DELAY_MS * 2 ** attempts;
}

export function nextRunAt(attempts: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + computeBackoffMs(attempts));
}

/** Czy job wyczerpal proby i powinien trafic do dead letter. */
export function isDeadLetter(
  attempts: number,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): boolean {
  return attempts >= maxAttempts;
}
