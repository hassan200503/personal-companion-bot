import { z } from 'zod';

export const turnDecisionSchema = z.object({
  schemaVersion: z.string().min(1),
  turnId: z.string().min(1),
  intent: z.object({ type: z.string().min(1), confidence: z.number().min(0).max(1) }),
  understanding: z.string().min(1).max(300),
  clarification: z.object({ question: z.string().min(1), options: z.array(z.string()).max(8) }).optional(),
  plan: z.array(z.object({
    step: z.string().min(1),
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
    expectedPostcondition: z.string().min(1)
  })).max(20),
  speech: z.object({ text: z.string().max(800), ssml: z.string().optional(), tone: z.string().min(1) }),
  memoryCandidates: z.array(z.object({
    category: z.string().min(1), content: z.string().min(1), origin: z.string().min(1), evidence: z.string().min(1)
  })).max(20),
  riskAssessment: z.object({ proposedRiskClass: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), reasons: z.array(z.string()).max(12) }),
  followUps: z.array(z.string()).max(12)
});

export type TurnDecision = z.infer<typeof turnDecisionSchema>;

export interface ValidationResult {
  ok: boolean;
  value?: TurnDecision;
  errors: string[];
}

export function parseTurnDecision(raw: string | unknown): ValidationResult {
  const value = typeof raw === 'string' ? parseJsonEnvelope(raw) : raw;
  const parsed = turnDecisionSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data, errors: [] };
  return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`) };
}

function parseJsonEnvelope(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch { return undefined; }
}
