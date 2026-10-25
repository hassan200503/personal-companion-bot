import { describe, expect, it } from "vitest";
import {
  defaultAppConfig,
  parseAppConfig,
  safeParseAppConfig
} from "./config";

describe("app config", () => {
  it("parses the default config", () => {
    expect(defaultAppConfig).toEqual({
      schemaVersion: 1,
      ui: { theme: "system" },
      logging: { level: "info" },
      background: { startAtLogin: false }
    });
  });

  it("fills defaults from a minimal config", () => {
    expect(parseAppConfig({ schemaVersion: 1 })).toEqual(defaultAppConfig);
  });

  it("preserves explicit values", () => {
    expect(
      parseAppConfig({
        schemaVersion: 1,
        ui: { theme: "dark" },
        logging: { level: "debug" },
        background: { startAtLogin: true }
      })
    ).toEqual({
      schemaVersion: 1,
      ui: { theme: "dark" },
      logging: { level: "debug" },
      background: { startAtLogin: true }
    });
  });

  it("rejects an unknown schema version", () => {
    expect(() => parseAppConfig({ schemaVersion: 2 })).toThrow();
  });

  it("returns a failure for an invalid theme", () => {
    const result = safeParseAppConfig({
      schemaVersion: 1,
      ui: { theme: "neon" }
    });

    expect(result.success).toBe(false);
  });
});
