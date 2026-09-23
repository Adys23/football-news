---
name: seo-audit
description: Audits a published article for Discover and search hygiene - metadata, canonical, NewsArticle JSON-LD, hero image width, anti-clickbait title, description length. Use when checking SEO of an article page.
---

# Audyt SEO artykulu

Google nie wymaga schema.org do Discover, ale higiena metadanych zostaje.

```bash
node .cursor/skills/seo-audit/scripts/audit-article.mjs <url>
```

Sprawdza: title <= 70, description 120-165, canonical, og:image, JSON-LD NewsArticle, zakazane frazy z `title-guard.ts`.
