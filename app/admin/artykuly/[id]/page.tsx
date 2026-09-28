import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleDecision } from "@/components/admin/ArticleDecision";
import { ArticleMetaForm } from "@/components/admin/ArticleMetaForm";
import { BlockEditor } from "@/components/admin/BlockEditor";
import { BlockRenderer } from "@/components/article/BlockRenderer";
import { FactTable } from "@/components/admin/FactTable";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { SourceList } from "@/components/admin/SourceList";
import {
  ARTICLE_STATUS_LABELS,
  PUBLISHABILITY_LABELS,
  SEVERITY_LABELS,
  eventTypeLabel,
  formatNewsroomTime,
  formatScore,
} from "@/lib/admin/labels";
import { scoresAreStale } from "@/lib/admin/article-edit";
import {
  assessmentIsStale,
  checkSeoField,
  assessmentSourceNumbers,
  factStatementsById,
  issuesByBlock,
  parseConflicts,
  parseContent,
  parseIssues,
  reviewFacts,
  type QaIssue,
  type SeoFieldCheck,
} from "@/lib/admin/review";
import {
  DECISION_STATUSES,
  SEO_REFRESH_PENDING,
  publishBlockers,
  seoRefreshPending,
} from "@/lib/admin/publish";
import { getArticleForReview } from "@/lib/admin/review-data";
import { requireRole } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recenzja artykułu",
  robots: { index: false, follow: false },
};

const SEVERITY_CLASSES: Record<QaIssue["severity"], string> = {
  low: "border-neutral-300 bg-neutral-50",
  medium: "border-amber-300 bg-amber-50",
  high: "border-red-300 bg-red-50",
};

function IssueList({ issues }: { issues: QaIssue[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {issues.map((issue, index) => (
        <li
          key={index}
          className={`rounded-md border p-2 text-sm ${SEVERITY_CLASSES[issue.severity]}`}
        >
          <span className="font-medium">Uwaga ({SEVERITY_LABELS[issue.severity]}):</span>{" "}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function SeoField({
  label,
  value,
  check,
}: {
  label: string;
  value: string | null;
  check: SeoFieldCheck;
}) {
  const range = [check.min ?? 0, check.max].filter((n) => n !== null).join("-");
  return (
    <div>
      <dt className={`text-xs ${check.ok ? "text-neutral-500" : "font-medium text-red-700"}`}>
        {label} ({check.length} znaków, wymagane {range})
      </dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

export default async function ArticleReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("editor");
  const { id } = await params;
  const article = await getArticleForReview(id);

  if (!article) {
    notFound();
  }

  const { story, scores, assessment, sources } = article;
  const content = parseContent(article.content);
  const issues = issuesByBlock(
    parseIssues(scores?.issues),
    content.ok ? content.content.blocks.length : 0,
  );
  const facts = reviewFacts(article.facts, sources, assessment?.approvedFactIds ?? null);
  const conflicts = parseConflicts(assessment?.conflicts);
  const stale = assessment ? assessmentIsStale(assessment.updatedAt, sources) : false;
  const sourceNumbers = assessmentSourceNumbers(sources);
  const scoresStale = scores ? scoresAreStale(scores.checkedAt, article.lastEditedAt) : false;
  const blockers = publishBlockers({
    ...article,
    unsupportedClaims: scores?.unsupportedClaims ?? null,
  });
  const sourceLabel = (index: number) => (!stale && sourceNumbers.get(index)) || `źródło ${index}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-sm text-neutral-500">
        <Link href="/admin" className="underline">
          Panel
        </Link>
        {" / Artykuł"}
      </p>
      <p className="mt-4 text-xs text-neutral-500">
        {ARTICLE_STATUS_LABELS[article.status]} · {eventTypeLabel(story.eventType)} · waga{" "}
        {story.importance} · utworzony {formatNewsroomTime(article.createdAt)}
      </p>

      {scores && scores.unsupportedClaims > 0 ? (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800">
          Publikacja zablokowana: twierdzenia bez podparcia w faktach ({scores.unsupportedClaims}).
          Tekst wymaga poprawy przed publikacją.
        </p>
      ) : null}

      <article className="mt-6">
        <h1 className="text-2xl font-semibold tracking-tight">{article.title}</h1>
        {article.lead ? <p className="mt-4 text-lg text-neutral-700">{article.lead}</p> : null}
        <div className="mt-6">
          {content.ok ? (
            <BlockRenderer
              blocks={content.content.blocks}
              factStatements={factStatementsById(article.facts)}
              renderAfter={(index) => {
                const blockIssues = issues.byBlock.get(index);
                return blockIssues ? <IssueList issues={blockIssues} /> : null;
              }}
            />
          ) : (
            <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm">
              <p className="font-medium">Treść nie przechodzi walidacji schematu.</p>
              <ul className="mt-2 list-disc pl-6">
                {content.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </article>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Decyzja</h2>
        {DECISION_STATUSES.includes(article.status) ? (
          <ArticleDecision
            articleId={article.id}
            updatedAt={article.updatedAt}
            blockers={blockers}
          />
        ) : (
          <p className="mt-2 text-sm text-neutral-600">
            {article.status === "published" && article.publishedAt
              ? `Opublikowany ${formatNewsroomTime(article.publishedAt)}.`
              : `Status: ${ARTICLE_STATUS_LABELS[article.status]}. Decyzja nie jest już możliwa.`}
          </p>
        )}
      </section>

      {article.status === "review" ? (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">Edycja</h2>
          <ArticleMetaForm
            articleId={article.id}
            updatedAt={article.updatedAt}
            title={article.title}
            lead={article.lead ?? ""}
          />
          <h3 className="mt-8 font-semibold">Treść</h3>
          {content.ok ? (
            <BlockEditor
              articleId={article.id}
              updatedAt={article.updatedAt}
              blocks={content.content.blocks}
              factStatements={Object.fromEntries(factStatementsById(article.facts))}
            />
          ) : (
            <p className="mt-2 text-sm text-neutral-600">
              Treść spoza schematu nie może być edytowana w panelu.
            </p>
          )}
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Ocena AI</h2>
        {scores ? (
          <>
            {scoresStale && article.lastEditedAt ? (
              <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                Ocena dotyczy wersji sprzed edycji redaktora z{" "}
                {formatNewsroomTime(article.lastEditedAt)}. Poprawiony tekst przeszedł tylko
                kontrolę deterministyczną, model go nie oceniał.
              </p>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <ScoreBadge label="Jakość" value={scores.quality} />
              <ScoreBadge label="Zgodność z faktami" value={scores.factualAccuracy} />
              <ScoreBadge label="Oryginalność" value={scores.originality} />
              <ScoreBadge label="SEO" value={scores.seo} />
              <ScoreBadge label="Clickbait" value={scores.clickbait} />
            </dl>
            {issues.general.length > 0 ? <IssueList issues={issues.general} /> : null}
          </>
        ) : (
          <p className="mt-4 text-sm text-neutral-600">Brak oceny automatycznej.</p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Ocena faktów</h2>
        {assessment ? (
          <>
            <p className="mt-2 text-sm text-neutral-600">
              {PUBLISHABILITY_LABELS[assessment.publishability]} · pewność{" "}
              {formatScore(assessment.confidence)}
            </p>
            {assessment.reasoning ? <p className="mt-2 text-sm">{assessment.reasoning}</p> : null}
            {stale ? (
              <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                Po ocenie doszły nowe źródła, więc numery źródeł w konfliktach mogą nie pasować do
                listy poniżej.
              </p>
            ) : null}
            {conflicts.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {conflicts.map((conflict, index) => (
                  <li
                    key={index}
                    className={`rounded-md border p-3 text-sm ${SEVERITY_CLASSES[conflict.severity]}`}
                  >
                    <p>
                      <span className="font-medium">
                        Konflikt ({SEVERITY_LABELS[conflict.severity]}):
                      </span>{" "}
                      {conflict.description}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {conflict.source_indexes.map(sourceLabel).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-neutral-600">Brak konfliktów między źródłami.</p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-neutral-600">Brak oceny faktów.</p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Fakty</h2>
        <FactTable facts={facts} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Źródła</h2>
        <SourceList sources={sources} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">SEO</h2>
        {seoRefreshPending(article) ? (
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            {SEO_REFRESH_PENDING}
          </p>
        ) : null}
        <dl className="mt-4 space-y-3 text-sm">
          <SeoField
            label="Tytuł SEO"
            value={article.seoTitle}
            check={checkSeoField("seo_title", article.seoTitle)}
          />
          <SeoField
            label="Opis SEO"
            value={article.seoDescription}
            check={checkSeoField("seo_description", article.seoDescription)}
          />
          <div>
            <dt className="text-xs text-neutral-500">Slug</dt>
            <dd className="break-all">{article.slug}</dd>
          </div>
        </dl>
      </section>

      <p className="mt-12 text-xs text-neutral-500">
        Tekst: {article.modelUsed ?? "—"}, prompt {article.promptVersion ?? "—"}
        {scores
          ? ` · ocena: ${scores.modelUsed ?? "—"}, ${formatNewsroomTime(scores.checkedAt)}`
          : ""}
        {assessment ? ` · fakty: ${assessment.modelUsed ?? "—"}` : ""}
      </p>
    </main>
  );
}
