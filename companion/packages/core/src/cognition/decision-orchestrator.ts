import { parseTurnDecision, type TurnDecision } from './contracts.js';
import type { ContextPacket } from './prompt-compiler.js';

export interface DecisionSource {
  id: string;
  complete(prompt: string, signal: AbortSignal): Promise<string>;
}

export interface DecisionResult {
  providerId: string;
  decision: TurnDecision;
  repaired: boolean;
}

export class DecisionOrchestrator {
  constructor(private readonly sources: readonly DecisionSource[]) {}

  async decide(packet: ContextPacket, signal: AbortSignal): Promise<DecisionResult> {
    let lastErrors = ['no_provider_attempted'];
    for (const source of this.sources) {
      if (signal.aborted) throw new Error('aborted');
      let raw: string;
      try {
        raw = await source.complete(packet.canonical, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        lastErrors = [`${source.id}: ${error instanceof Error ? error.message : String(error)}`];
        continue;
      }
      const first = parseTurnDecision(raw);
      if (first.ok) return { providerId: source.id, decision: first.value!, repaired: false };
      lastErrors = first.errors;
      let repairedRaw: string;
      try {
        repairedRaw = await source.complete(`${packet.canonical}\nValidation errors: ${lastErrors.join('; ')}\nReturn corrected JSON only.`, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        lastErrors = [`${source.id}: ${error instanceof Error ? error.message : String(error)}`];
        continue;
      }
      const repaired = parseTurnDecision(repairedRaw);
      if (repaired.ok) return { providerId: source.id, decision: repaired.value!, repaired: true };
      lastErrors = repaired.errors;
    }
    throw new Error(`no_valid_turn_decision:${lastErrors.join('|')}`);
  }
}
