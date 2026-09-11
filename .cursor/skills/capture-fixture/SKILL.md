---
name: capture-fixture
description: Saves a live source feed response as a test fixture with sensitive headers stripped and dates normalized. Use when recording RSS or JSON for parser tests.
---

# Zapis fixture'u zrodla

Surowa odpowiedz zrodla zapisujemy do testow, zeby CI nie wolalo internetu.

```bash
node .cursor/skills/capture-fixture/scripts/capture.mjs <url> [nazwa]
```

Plik trafia do `tests/fixtures/sources/<nazwa>.xml` albo `.json`.
