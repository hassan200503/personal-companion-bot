export interface StyleRules {
  ownerName?: string;
  maxCharacters?: number;
  maxSentences?: number;
  forbiddenPhrases?: readonly string[];
  speakSafe?: boolean;
}

const sensitivePattern = /\b(password|passcode|secret|message content|private message|sender|bank account|card number|amount of)\b/i;

export function normalizeSpeech(input: string, rules: StyleRules = {}): string {
  const trimmed = input.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'I could not produce a response.';
  if (rules.speakSafe && sensitivePattern.test(trimmed)) return 'I have an update that needs your attention.';
  let output = trimmed;
  for (const phrase of rules.forbiddenPhrases ?? []) {
    if (phrase.trim()) output = output.replace(new RegExp(escapeRegExp(phrase), 'gi'), '');
  }
  output = output.replace(/\s+/g, ' ').trim();
  const maxSentences = rules.maxSentences ?? 3;
  const sentences = output.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  output = sentences.slice(0, maxSentences).join(' ');
  const maxCharacters = rules.maxCharacters ?? 800;
  if (output.length > maxCharacters) output = `${output.slice(0, Math.max(0, maxCharacters - 1)).trim()}…`;
  return output;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
