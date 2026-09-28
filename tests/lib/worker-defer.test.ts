import { describe, expect, it, vi } from "vitest";
import type { JobRow, ServiceClient } from "@shared/lib/jobs.ts";
import { DeferJobError } from "@shared/lib/jobs.ts";
import { processJobBatch } from "@shared/lib/worker.ts";

const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("@shared/handlers/index.ts", () => ({
  ACTIVE_JOB_TYPES: ["CHECK_ARTICLE", "GENERATE_SEO"],
  jobHandlers: {
    CHECK_ARTICLE: () => Promise.reject(new DeferJobError("limit godzinowy", 300_000)),
    GENERATE_SEO: () => Promise.reject(new Error("zly slug")),
  },
}));

function fakeClient(jobs: Partial<JobRow>[]) {
  const rpc = vi
    .fn()
    .mockImplementation((name: string) =>
      Promise.resolve({ data: name === "claim_jobs" ? jobs : null, error: null }),
    );
  const settings = {
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };
  const client = { rpc, from: vi.fn().mockReturnValue(settings) } as Pick<
    ServiceClient,
    "rpc" | "from"
  > as ServiceClient;
  return { client, rpc };
}

describe("processJobBatch", () => {
  it("odklada job przez defer_job zamiast zuzywac probe w fail_job", async () => {
    const { client, rpc } = fakeClient([{ id: JOB_ID, type: "CHECK_ARTICLE", payload: {} }]);

    await expect(processJobBatch({ client })).resolves.toBe(1);

    expect(rpc).toHaveBeenCalledWith("defer_job", {
      p_id: JOB_ID,
      p_delay: "300 seconds",
      p_reason: "limit godzinowy",
    });
    expect(rpc).not.toHaveBeenCalledWith("fail_job", expect.anything());
  });

  it("zwykly blad handlera nadal idzie do fail_job", async () => {
    const { client, rpc } = fakeClient([{ id: JOB_ID, type: "GENERATE_SEO", payload: {} }]);

    await processJobBatch({ client });

    expect(rpc).toHaveBeenCalledWith("fail_job", { p_id: JOB_ID, p_error: "zly slug" });
    expect(rpc).not.toHaveBeenCalledWith("defer_job", expect.anything());
  });
});
