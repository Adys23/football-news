/**
 * Identyfikatory z seed.sql. Testy i CLI moga sie do nich odwolywac,
 * zamiast wpisywac te same UUID w wielu plikach.
 */
export const SEED = {
  editorUserId: "11111111-1111-4111-8111-111111111111",
  authorId: "22222222-2222-4222-8222-222222222222",
  categories: {
    transfers: "33333333-3333-4333-8333-333333333331",
    football: "33333333-3333-4333-8333-333333333332",
    ekstraklasa: "33333333-3333-4333-8333-333333333333",
  },
  leagues: {
    premierLeague: "44444444-4444-4444-8444-444444444441",
    ekstraklasa: "44444444-4444-4444-8444-444444444442",
    laliga: "44444444-4444-4444-8444-444444444443",
  },
  clubs: {
    manchesterUnited: "55555555-5555-4555-8555-555555555551",
    arsenal: "55555555-5555-4555-8555-555555555552",
    lechPoznan: "55555555-5555-4555-8555-555555555553",
    legiaWarszawa: "55555555-5555-4555-8555-555555555554",
    barcelona: "55555555-5555-4555-8555-555555555555",
  },
  players: {
    lewandowski: "66666666-6666-4666-8666-666666666661",
    fernandes: "66666666-6666-4666-8666-666666666662",
  },
} as const;

export const SAMPLE_UUID = "11111111-1111-4111-8111-111111111111";
export const SAMPLE_UUID_B = "22222222-2222-4222-8222-222222222222";
