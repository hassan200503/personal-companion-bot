export interface CapabilityReport {
  appId: string;
  version: string;
  integrity: 'low' | 'medium' | 'high' | 'system' | 'unknown';
  accessibilityElements: number;
  supportedLevels: readonly ('L0' | 'L1' | 'L2' | 'L3' | 'L4')[];
  successRate: number;
  observations: number;
  verifiedAt: string;
}

export interface CapabilityStore {
  get(appId: string, version: string): CapabilityReport | undefined;
  put(report: CapabilityReport): void;
  recordOutcome(appId: string, version: string, success: boolean, now: string): void;
}

export interface CapabilityKeyValueStore {
  read(key: string): string | undefined;
  write(key: string, value: string): void;
}

export class InMemoryCapabilityStore implements CapabilityStore {
  private readonly reports = new Map<string, CapabilityReport>();

  get(appId: string, version: string): CapabilityReport | undefined {
    return this.reports.get(key(appId, version));
  }

  put(report: CapabilityReport): void { this.reports.set(key(report.appId, report.version), { ...report, supportedLevels: [...report.supportedLevels] }); }

  recordOutcome(appId: string, version: string, success: boolean, now: string): void {
    const current = this.get(appId, version);
    if (!current) return;
    const observations = Math.max(1, Math.round(current.observations));
    const nextObservations = observations + 1;
    const nextRate = ((current.successRate * observations) + (success ? 1 : 0)) / nextObservations;
    this.put({ ...current, successRate: nextRate, observations: nextObservations, verifiedAt: now });
  }
}

/** Adapter for the encrypted settings table or another local durable store. */
export class PersistentCapabilityStore implements CapabilityStore {
  constructor(private readonly storage: CapabilityKeyValueStore) {}

  get(appId: string, version: string): CapabilityReport | undefined {
    const raw = this.storage.read(storageKey(appId, version));
    if (!raw) return undefined;
    try {
      const report = JSON.parse(raw) as CapabilityReport;
      return report.appId === appId && report.version === version ? report : undefined;
    } catch {
      return undefined;
    }
  }

  put(report: CapabilityReport): void {
    this.storage.write(storageKey(report.appId, report.version), JSON.stringify(report));
  }

  recordOutcome(appId: string, version: string, success: boolean, now: string): void {
    const current = this.get(appId, version);
    if (!current) return;
    const observations = Math.max(1, Math.round(current.observations));
    const nextObservations = observations + 1;
    this.put({
      ...current,
      successRate: ((current.successRate * observations) + (success ? 1 : 0)) / nextObservations,
      observations: nextObservations,
      verifiedAt: now,
    });
  }
}

function key(appId: string, version: string): string { return `${appId}\0${version}`; }
function storageKey(appId: string, version: string): string { return `capability.${encodeURIComponent(appId)}.${encodeURIComponent(version)}`; }
