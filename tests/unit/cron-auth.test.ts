import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeCron } from "@/lib/cron-auth";

describe("authorizeCron", () => {
  const prev = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "0123456789abcdef0123456789abcdef";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("répond 503 quand le secret est absent ou trop court", async () => {
    process.env.CRON_SECRET = "short";
    const r = authorizeCron(new Request("http://x/api/cron/sync"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });
  it("répond 401 avec un mauvais bearer", () => {
    const r = authorizeCron(new Request("http://x/api/cron/sync", { headers: { authorization: "Bearer nope" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });
  it("accepte le bon bearer", () => {
    const r = authorizeCron(new Request("http://x/api/cron/sync", { headers: { authorization: "Bearer 0123456789abcdef0123456789abcdef" } }));
    expect(r.ok).toBe(true);
  });
});
