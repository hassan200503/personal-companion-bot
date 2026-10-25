import { describe, expect, it } from "vitest";
import { createLogger, redact } from "./logger";

describe("redact", () => {
  it("redacts sensitive keys at any depth", () => {
    expect(
      redact({
        apiKey: "sk-123",
        nested: { authorization: "Bearer x", safe: "ok" },
        list: [{ token: "t" }]
      })
    ).toEqual({
      apiKey: "[REDACTED]",
      nested: { authorization: "[REDACTED]", safe: "ok" },
      list: [{ token: "[REDACTED]" }]
    });
  });

  it("handles circular references", () => {
    const value: Record<string, unknown> = { safe: "ok" };
    value.self = value;

    expect(redact(value)).toEqual({ safe: "ok", self: "[Circular]" });
  });

  it("keeps error fields", () => {
    const error = new Error("boom");

    expect(redact({ error })).toMatchObject({
      error: { name: "Error", message: "boom" }
    });
  });
});

describe("createLogger", () => {
  it("filters by level and redacts context", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "info",
      sink: (line) => lines.push(line)
    });

    logger.debug("hidden", { apiKey: "secret" });
    logger.info("visible", { apiKey: "secret", safe: "ok" });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"level":"info"');
    expect(lines[0]).toContain('"apiKey":"[REDACTED]"');
    expect(lines[0]).not.toContain("secret");
  });
});
