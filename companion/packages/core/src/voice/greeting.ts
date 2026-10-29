export interface GreetingOptions {
  ownerName: string;
  pronunciation?: string;
  now?: Date;
  awayMinutes?: number;
  relevantNudge?: string;
  recentGreetings?: readonly string[];
  quietHours?: { start: string; end: string };
  muted?: boolean;
}

export interface GreetingResult {
  text: string;
  ssml?: string;
  shouldSpeak: boolean;
  reason?: 'muted' | 'quiet_hours';
}

const templates = {
  morning: ['Good morning, {name}. I am ready when you are.', 'Morning, {name}. What would you like to work on?'],
  afternoon: ['Good afternoon, {name}. I am here and ready to help.', 'Hello, {name}. What should we take care of?'],
  evening: ['Good evening, {name}. I am ready for whatever is next.', 'Evening, {name}. What would you like to do?'],
  night: ['You are up late, {name}. I am here if you need me.', 'Good night, {name}. What can I help with before you wrap up?']
} as const;

function minutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function inQuietHours(now: Date, quietHours?: GreetingOptions['quietHours']): boolean {
  if (!quietHours) return false;
  const parse = (value: string) => {
    const [hour = 0, minute = 0] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  const current = minutes(now);
  const start = parse(quietHours.start);
  const end = parse(quietHours.end);
  return start === end ? true : start < end ? current >= start && current < end : current >= start || current < end;
}

function period(hour: number): keyof typeof templates {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
}

export function composeGreeting(options: GreetingOptions): GreetingResult {
  const now = options.now ?? new Date();
  const name = options.ownerName.trim() || 'there';
  const choices = templates[period(now.getHours())];
  const recent = new Set(options.recentGreetings ?? []);
  const index = choices.findIndex((choice) => !recent.has(choice.replace('{name}', name)));
  let text = (choices[index >= 0 ? index : 0] ?? choices[0]).replace('{name}', name);
  if (options.awayMinutes !== undefined && options.awayMinutes >= 120) {
    text = `Welcome back, ${name}. ${text.split('. ').slice(1).join('. ')}`;
  }
  if (options.relevantNudge?.trim() && text.split('. ').length < 2) text += ` ${options.relevantNudge.trim()}`;
  const quiet = inQuietHours(now, options.quietHours);
  const reason = options.muted ? 'muted' : quiet ? 'quiet_hours' : undefined;
  const ssml = options.pronunciation?.trim()
    ? text.replace(name, `<phoneme alphabet="ipa" ph="${escapeXml(options.pronunciation.trim())}">${escapeXml(name)}</phoneme>`)
    : undefined;
  return { text, ssml, shouldSpeak: !reason, ...(reason ? { reason } : {}) };
}
