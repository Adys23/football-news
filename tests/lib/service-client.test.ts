import { describe, expect, it } from "vitest";
import { JobError } from "@shared/lib/jobs.ts";
import { assertServiceRole, createServiceClient } from "@shared/lib/service-client.ts";

describe("createServiceClient", () => {
  it("rzuca, gdy brakuje url albo klucza", () => {
    expect(() => createServiceClient("", "key")).toThrow(JobError);
    expect(() => createServiceClient("http://127.0.0.1", "")).toThrow(JobError);
  });
});

describe("assertServiceRole", () => {
  it("odrzuca brak naglowka", () => {
    const response = assertServiceRole(new Request("http://local.test"), "secret");
    expect(response?.status).toBe(401);
  });

  it("wpuszcza pasujacy Bearer", () => {
    const req = new Request("http://local.test", { headers: { Authorization: "Bearer secret" } });
    expect(assertServiceRole(req, "secret")).toBeNull();
  });
});
