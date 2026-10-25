import { z } from "zod";

export const configSchemaVersion = 1 as const;

export const appConfigSchema = z.object({
  schemaVersion: z.literal(configSchemaVersion),
  ui: z
    .object({
      theme: z.enum(["system", "light", "dark"]).default("system")
    })
    .default({ theme: "system" }),
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info")
    })
    .default({ level: "info" }),
  background: z
    .object({
      startAtLogin: z.boolean().default(false)
    })
    .default({ startAtLogin: false })
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const defaultAppConfig: AppConfig = appConfigSchema.parse({
  schemaVersion: configSchemaVersion
});

export function parseAppConfig(input: unknown): AppConfig {
  return appConfigSchema.parse(input);
}

export function safeParseAppConfig(input: unknown) {
  return appConfigSchema.safeParse(input);
}
