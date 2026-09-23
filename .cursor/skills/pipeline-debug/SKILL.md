---
name: pipeline-debug
description: Diagnoses the newsroom job queue and AI pipeline. Use when jobs are dead, stories are blocked, LLM costs spike, or the user asks to replay a job or inspect llm_calls.
---

# Diagnoza pipeline'u

Najpierw zatrzymaj publikacje, jesli tresc jest zla: `settings.pipeline_enabled = false`. Runbook: [docs/runbook.md](../../../docs/runbook.md).

## Komendy

```bash
npm run jobs:status
node .cursor/skills/pipeline-debug/scripts/dump-jobs.mjs
npm run job:replay -- <id>
npm run llm:cost -- 7
npm run story:show -- <id>
```

Nie zwiekszaj `max_attempts`, zeby przepchnac martwe joby. Napraw przyczyne, potem replay.
