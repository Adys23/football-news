import { describe, expect, it, vi } from "vitest";
import { logError, logInfo } from "@shared/lib/log.ts";

describe("log", () => {
  it("pisze zdarzenie informacyjne na stderr przez console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logInfo("job.claimed", { jobId: "abc", count: 1 });

    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ level: "info", event: "job.claimed", jobId: "abc", count: 1 });
    expect(typeof line.ts).toBe("string");

    warn.mockRestore();
  });

  it("pisze blad przez console.error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError("job.failed", { ok: false });

    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(error.mock.calls[0]?.[0]));
    expect(line.level).toBe("error");
    expect(line.event).toBe("job.failed");
    expect(line.ok).toBe(false);

    error.mockRestore();
  });
});
