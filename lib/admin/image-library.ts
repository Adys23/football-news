import "server-only";

import { IMAGE_ASSET_COLUMNS, licensedImage, type LicensedImage } from "@contracts/index.ts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Gorna granica listy w panelu; wyszukiwanie i upload to V2 (docs/roadmap.md). */
export const IMAGE_LIBRARY_LIMIT = 200;

/**
 * Obrazy, ktore redaktor moze wstawic do artykulu: z licencja i nie AI. Filtr AI jest
 * w zapytaniu i jeszcze raz w kontrakcie (licensedImage); baza i tak odrzuci inny wybor (0027).
 */
export async function getImageLibrary(): Promise<LicensedImage[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("image_assets")
    .select(IMAGE_ASSET_COLUMNS)
    .eq("is_ai_generated", false)
    .order("created_at", { ascending: false })
    .limit(IMAGE_LIBRARY_LIMIT);

  if (error) {
    throw new Error(`Nie udalo sie odczytac biblioteki obrazow: ${error.message}`);
  }
  return data.flatMap((row) => {
    const image = licensedImage(row);
    return image ? [image] : [];
  });
}

/** Jeden obraz z biblioteki po id albo null, gdy go nie ma lub nie spelnia zasad. */
export async function getLibraryImage(id: string): Promise<LicensedImage | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("image_assets")
    .select(IMAGE_ASSET_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udalo sie odczytac obrazu ${id}: ${error.message}`);
  }
  return licensedImage(data);
}

/** Obrazy o podanych id, ktore spelniaja zasady biblioteki (licencja, nie AI). */
export async function getLibraryImages(ids: readonly string[]): Promise<LicensedImage[]> {
  if (ids.length === 0) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("image_assets")
    .select(IMAGE_ASSET_COLUMNS)
    .in("id", [...ids]);

  if (error) {
    throw new Error(`Nie udalo sie odczytac obrazow: ${error.message}`);
  }
  return data.flatMap((row) => {
    const image = licensedImage(row);
    return image ? [image] : [];
  });
}

/** Obrazy, ktore redaktor moze dodac do tresci: zbior id z licencja, nie AI. */
export async function getLibraryImageIds(ids: readonly string[]): Promise<Set<string>> {
  return new Set((await getLibraryImages(ids)).map((image) => image.id));
}

/**
 * Lista do panelu artykulu: najnowsze obrazy biblioteki plus obrazy, ktorych artykul juz
 * uzywa. Bez tego obraz starszy niz IMAGE_LIBRARY_LIMIT wygladalby w panelu na brakujacy.
 */
export async function getImageLibraryForArticle(
  usedIds: readonly string[],
): Promise<LicensedImage[]> {
  const [recent, used] = await Promise.all([getImageLibrary(), getLibraryImages(usedIds)]);
  const known = new Set(recent.map((image) => image.id));
  return [...recent, ...used.filter((image) => !known.has(image.id))];
}
