/**
 * Wspolne kontrakty dla Edge Functions (Deno) i aplikacji Next.js.
 *
 * Deno rozwiazuje importy przez import map w supabase/functions/deno.json,
 * Next.js przez alias @contracts/* w tsconfig.json. Jedno zrodlo prawdy -
 * nie duplikuj tych schematow po stronie aplikacji.
 */

export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  Json,
} from "./database.types.ts";

export * from "./facts.ts";
export * from "./assessment.ts";
export * from "./article.ts";
export * from "./image.ts";
export * from "./jobs.ts";
