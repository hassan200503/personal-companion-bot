import type { ChatMessage, ProviderCapabilities } from '../providers/contracts.js';

export interface PersistentSelf {
  identity: string;
  style: string;
  policy: string;
}

export interface ContextPacketInput {
  self: PersistentSelf;
  ownerModel?: string;
  situation?: string;
  memories?: readonly string[];
  recentTurns?: readonly ChatMessage[];
  toolSchemas?: readonly string[];
  outputContract: string;
}

export interface ContextPacket {
  layers: { level: string; content: string }[];
  canonical: string;
}

export function buildContextPacket(input: ContextPacketInput, capabilities?: ProviderCapabilities): ContextPacket {
  const layers = [
    { level: 'L0', content: input.self.policy },
    { level: 'L1', content: `${input.self.identity}\n${input.self.style}` },
    { level: 'L2', content: input.ownerModel ?? '' },
    { level: 'L3', content: input.situation ?? '' },
    { level: 'L4', content: (input.memories ?? []).map((memory) => `- ${memory}`).join('\n') },
    { level: 'L5', content: (input.recentTurns ?? []).map((turn) => `${turn.role}: ${turn.content}`).join('\n') },
    { level: 'L6', content: (input.toolSchemas ?? []).join('\n') },
    { level: 'L7', content: input.outputContract }
  ];
  const maxChars = Math.max(4_000, (capabilities?.maxContextLength ?? 16_000) * 4);
  const preserved = layers.map((layer) => ({ ...layer }));
  let total = preserved.reduce((sum, layer) => sum + layer.content.length, 0);
  for (const layer of [preserved[5], preserved[4], preserved[3]]) {
    if (total <= maxChars || !layer) break;
    const keep = Math.max(0, maxChars - (total - layer.content.length));
    layer.content = layer.content.slice(-keep);
    total = preserved.reduce((sum, item) => sum + item.content.length, 0);
  }
  const canonical = preserved.map((layer) => `[${layer.level}]\n${layer.content}`).join('\n\n');
  return { layers: preserved, canonical };
}

export function renderContextMessages(packet: ContextPacket, userMessage: string): ChatMessage[] {
  return [{ role: 'system', content: packet.canonical }, { role: 'user', content: userMessage }];
}
