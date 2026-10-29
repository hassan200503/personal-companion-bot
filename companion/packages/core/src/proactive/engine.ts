export type ProactiveChannel = 'visual' | 'chime' | 'speech';

export interface ProactiveCandidate {
  id: string;
  topic: string;
  message: string;
  reason: string;
  urgency: number;
  importance: number;
  createdAt: number;
}

export interface ProactiveSettings {
  now: number;
  quietHours?: { start: number; end: number };
  spokenDailyCap?: number;
  visualDailyCap?: number;
  cooldownMs?: number;
  focused?: boolean;
}

export interface ProactiveDecision {
  show: boolean;
  channel: ProactiveChannel;
  reason: string;
  candidate: ProactiveCandidate;
}

export class ProactiveEngine {
  private readonly delivered: { candidate: ProactiveCandidate; channel: ProactiveChannel; at: number }[] = [];
  private readonly dismissedTopics = new Map<string, number>();
  private receptivity = new Map<number, { accepted: number; dismissed: number }>();

  evaluate(candidate: ProactiveCandidate, settings: ProactiveSettings): ProactiveDecision {
    const channel = candidate.urgency >= 0.9 || candidate.importance >= 0.9 ? 'speech' : candidate.importance >= 0.5 ? 'chime' : 'visual';
    if (settings.focused || this.isQuiet(settings.now, settings.quietHours)) return { show: false, channel, reason: 'quiet_or_focus', candidate };
    const dayStart = new Date(settings.now); dayStart.setHours(0, 0, 0, 0);
    const today = this.delivered.filter((item) => item.at >= dayStart.getTime());
    const speechCount = today.filter((item) => item.channel === 'speech').length;
    const visualCount = today.filter((item) => item.channel === 'visual').length;
    if (channel === 'speech' && speechCount >= (settings.spokenDailyCap ?? 5)) return { show: false, channel, reason: 'spoken_budget', candidate };
    if (channel === 'visual' && visualCount >= (settings.visualDailyCap ?? 12)) return { show: false, channel, reason: 'visual_budget', candidate };
    const last = this.delivered.filter((item) => item.candidate.topic === candidate.topic).at(-1);
    if (last && settings.now - last.at < (settings.cooldownMs ?? 60 * 60 * 1000)) return { show: false, channel, reason: 'cooldown', candidate };
    const dismissedUntil = this.dismissedTopics.get(candidate.topic) ?? 0;
    if (dismissedUntil > settings.now) return { show: false, channel, reason: 'dismissed', candidate };
    this.delivered.push({ candidate, channel, at: settings.now });
    return { show: true, channel, reason: candidate.reason, candidate };
  }

  dismiss(topic: string, until: number): void {
    this.dismissedTopics.set(topic, until);
    const hour = new Date().getHours();
    const current = this.receptivity.get(hour) ?? { accepted: 0, dismissed: 0 };
    current.dismissed += 1;
    this.receptivity.set(hour, current);
  }

  accept(topic: string): void {
    const hour = new Date().getHours();
    const current = this.receptivity.get(hour) ?? { accepted: 0, dismissed: 0 };
    current.accepted += 1;
    this.receptivity.set(hour, current);
    void topic;
  }

  getReceptivity(): Record<number, { accepted: number; dismissed: number }> { return Object.fromEntries(this.receptivity); }
  resetReceptivity(): void { this.receptivity.clear(); }

  private isQuiet(now: number, range?: { start: number; end: number }): boolean {
    if (!range) return false;
    const hour = new Date(now).getHours();
    return range.start === range.end ? true : range.start < range.end ? hour >= range.start && hour < range.end : hour >= range.start || hour < range.end;
  }
}
