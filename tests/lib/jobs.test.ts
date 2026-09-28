import { describe, expect, it, vi } from "vitest";
import {
  DeferJobError,
  JobError,
  claimJobs,
  completeJob,
  deferJob,
  enqueueJob,
  failJob,
  requeueDeadJobs,
  requeueStaleJobs,
} from "@shared/lib/jobs.ts";
import type { ServiceClient } from "@shared/lib/jobs.ts";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fakeClient(rpc: ServiceClient["rpc"]): ServiceClient {
  return { rpc } as ServiceClient;
}

describe("enqueueJob", () => {
  it("waliduje payload zanim wywola RPC", async () => {
    const rpc = vi.fn();
    const client = fakeClient(rpc);

    await expect(
      enqueueJob(client, { type: "FETCH_SOURCE", payload: { sourceId: "nie-uuid" } }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("odrzuca typy odroczone do pozniejszych etapow", async () => {
    const rpc = vi.fn();
    const client = fakeClient(rpc);

    await expect(
      enqueueJob(client, { type: "GENERATE_IMAGE", payload: { articleId: SOURCE_ID } }),
    ).rejects.toBeInstanceOf(JobError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("przekazuje zwalidowany payload do enqueue_job", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: JOB_ID, error: null });
    const client = fakeClient(rpc);

    await expect(
      enqueueJob(client, {
        type: "FETCH_SOURCE",
        payload: { sourceId: SOURCE_ID },
        dedupeKey: `FETCH_SOURCE:${SOURCE_ID}`,
        sourceId: SOURCE_ID,
      }),
    ).resolves.toBe(JOB_ID);

    expect(rpc).toHaveBeenCalledWith(
      "enqueue_job",
      expect.objectContaining({
        p_type: "FETCH_SOURCE",
        p_payload: { sourceId: SOURCE_ID },
        p_dedupe_key: `FETCH_SOURCE:${SOURCE_ID}`,
        p_source_id: SOURCE_ID,
      }),
    );
  });

  it("zwraca null, gdy zadanie juz jest w kolejce", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = fakeClient(rpc);

    await expect(
      enqueueJob(client, { type: "FETCH_SOURCE", payload: { sourceId: SOURCE_ID } }),
    ).resolves.toBeNull();
  });

  it("owija blad RPC w JobError", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    const client = fakeClient(rpc);

    await expect(
      enqueueJob(client, { type: "FETCH_SOURCE", payload: { sourceId: SOURCE_ID } }),
    ).rejects.toThrow(/timeout/);
  });
});

describe("claimJobs / completeJob / failJob", () => {
  it("claimJobs zwraca pusta liste, gdy kolejka jest pusta", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = fakeClient(rpc);

    await expect(claimJobs(client, { types: ["EXTRACT_FACTS"], limit: 5 })).resolves.toEqual([]);
  });

  it("completeJob i failJob wołaja wlasciwe RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = fakeClient(rpc);

    await completeJob(client, JOB_ID);
    await failJob(client, JOB_ID, "timeout modelu");

    expect(rpc).toHaveBeenNthCalledWith(1, "complete_job", { p_id: JOB_ID });
    expect(rpc).toHaveBeenNthCalledWith(2, "fail_job", {
      p_id: JOB_ID,
      p_error: "timeout modelu",
    });
  });

  it("deferJob przekazuje opoznienie w sekundach, zaokraglone w gore", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = fakeClient(rpc);

    await deferJob(client, JOB_ID, 90_500, "limit godzinowy");

    expect(rpc).toHaveBeenCalledWith("defer_job", {
      p_id: JOB_ID,
      p_delay: "91 seconds",
      p_reason: "limit godzinowy",
    });
  });

  it("DeferJobError jest bledem joba z opoznieniem", () => {
    const error = new DeferJobError("limit", 1_000);

    expect(error).toBeInstanceOf(JobError);
    expect(error.delayMs).toBe(1_000);
  });

  it("requeueDeadJobs zwraca liczbe przywroconych zadan", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    const client = fakeClient(rpc);

    await expect(requeueDeadJobs(client, "EXTRACT_FACTS")).resolves.toBe(3);
  });

  it("requeueStaleJobs zwraca liczbe osieroconych zadan", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const client = fakeClient(rpc);

    await expect(requeueStaleJobs(client)).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("requeue_stale_jobs");
  });

  it("owija bledy claim, complete, fail i requeue", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } });
    const client = fakeClient(rpc);

    await expect(claimJobs(client)).rejects.toThrow(/db down/);
    await expect(completeJob(client, JOB_ID)).rejects.toThrow(/db down/);
    await expect(failJob(client, JOB_ID, "x")).rejects.toThrow(/db down/);
    await expect(deferJob(client, JOB_ID, 1_000, "x")).rejects.toThrow(/db down/);
    await expect(requeueDeadJobs(client)).rejects.toThrow(/db down/);
    await expect(requeueStaleJobs(client)).rejects.toThrow(/db down/);
  });
});
