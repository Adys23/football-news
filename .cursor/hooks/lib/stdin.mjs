/** Wczytuje JSON podany hookowi na stdin. Zwraca pusty obiekt, gdy wejscie jest puste. */
export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Zbiera wszystkie wartosci tekstowe z obiektu - hooki dostaja rozne kształty wejscia. */
export function collectStrings(value, acc = []) {
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, acc);
  }
  return acc;
}
