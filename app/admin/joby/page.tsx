import type { Metadata } from "next";
import Link from "next/link";
import { JobRequeueButton } from "@/components/admin/JobRequeueButton";
import { OPS_JOB_STATUS_LABELS } from "@/lib/admin/ops";
import { getOpsJobs } from "@/lib/admin/ops-data";
import { formatNewsroomTime } from "@/lib/admin/labels";
import { requireRole } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Joby z błędami",
  robots: { index: false, follow: false },
};

export default async function AdminJobsPage() {
  await requireRole("admin");
  const { jobs, total } = await getOpsJobs();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-sm text-neutral-500">
        <Link href="/admin" className="underline">
          Panel
        </Link>
        {" / Joby"}
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Joby z błędami</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Martwe joby wymagają decyzji: ponów dopiero po usunięciu przyczyny. Joby czekające na
        ponowienie worker podejmie sam.
      </p>

      {jobs.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">Brak martwych i nieudanych jobów.</p>
      ) : (
        <>
          {total > jobs.length ? (
            <p className="mt-8 text-sm text-neutral-600">
              Pokazano {jobs.length} z {total}.
            </p>
          ) : null}
          <ul className="mt-8 space-y-4">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-md border border-neutral-200 p-4">
                <p className="font-medium">
                  {job.type}{" "}
                  <span
                    className={
                      job.status === "dead" ? "text-destructive text-sm" : "text-sm text-amber-700"
                    }
                  >
                    · {OPS_JOB_STATUS_LABELS[job.status]}
                  </span>
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  próby {job.attempts}/{job.maxAttempts} · {job.timeline.label}{" "}
                  {formatNewsroomTime(job.timeline.at)} · <code>{job.id}</code>
                  {job.target ? (
                    <>
                      {" · "}
                      <Link href={job.target.href} className="underline">
                        {job.target.label}
                      </Link>
                    </>
                  ) : null}
                </p>
                {job.error ? (
                  <pre className="mt-3 overflow-x-auto rounded bg-neutral-50 p-2 text-xs break-words whitespace-pre-wrap">
                    {job.error}
                  </pre>
                ) : null}
                {job.status === "dead" ? (
                  <div className="mt-3">
                    <JobRequeueButton jobId={job.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
