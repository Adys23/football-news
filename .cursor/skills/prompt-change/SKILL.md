---
name: prompt-change
description: Workflow for changing an AI pipeline prompt. Use when editing files in _shared/prompts, bumping prompt_version, or comparing fixture output before and after a prompt change.
disable-model-invocation: true
---

# Zmiana promptu

Jeden prompt, jedno zadanie. Model do pisania nie dostaje surowych zrodel.

## Kroki

1. Uruchom ewaluacje na fixtures **przed** zmiana: `node .cursor/skills/prompt-change/scripts/run-prompt-eval.mjs`
2. Zmien plik `.md` w `supabase/functions/_shared/prompts/`.
3. Podnies wersje w `supabase/functions/_shared/prompts/versions.ts` (plik powstaje w etapie 2).
4. Uruchom ewaluacje ponownie i porownaj wynik.
5. Zacommituj prompt osobno od zmiany handlera.

Do etapu 2 skrypt tylko przypomina, ze fixtures LLM jeszcze nie istnieja.
