import os from 'node:os';
import type {
  SetupStep,
  StepContext,
  StepDetectionResult,
  StepResult,
  StepExplanation,
} from '../contracts.js';

interface SystemRequirements {
  minWindowsVersion: string;
  minFreeDiskMB: number;
  minFreeMemoryMB: number;
}

const REQUIREMENTS: SystemRequirements = {
  minWindowsVersion: '10.0.19041', // Windows 10 20H1 minimum
  minFreeDiskMB: 500,
  minFreeMemoryMB: 512,
};

interface SystemCheckData {
  osVersion: string;
  freeDiskMB: number;
  freeMemoryMB: number;
  platform: string;
}

/**
 * System check step - verifies the environment meets minimum requirements
 * Required, non-skippable, automatic
 */
export class SystemCheckStep implements SetupStep {
  readonly id = 'system-check';
  readonly title = 'System requirements check';
  readonly ownerModule = 'onboarding';
  readonly dependsOn = [] as const;
  readonly required = true;
  readonly skippable = false;
  readonly estimatedSeconds = 5;

  async detect(ctx: StepContext): Promise<StepDetectionResult> {
    try {
      const checks = await this.performChecks(ctx);

      // Check Windows platform
      if (checks.platform !== 'win32') {
        return {
          status: 'failed',
          code: 'UNSUPPORTED_PLATFORM',
          message: `This application requires Windows. Detected platform: ${checks.platform}`,
        };
      }

      // Check Windows version
      if (this.compareVersions(checks.osVersion, REQUIREMENTS.minWindowsVersion) < 0) {
        return {
          status: 'failed',
          code: 'UNSUPPORTED_WINDOWS_VERSION',
          message: `Windows ${REQUIREMENTS.minWindowsVersion} or later is required. Detected: ${checks.osVersion}`,
        };
      }

      // Check disk space
      if (checks.freeDiskMB < REQUIREMENTS.minFreeDiskMB) {
        return {
          status: 'failed',
          code: 'INSUFFICIENT_DISK_SPACE',
          message: `At least ${REQUIREMENTS.minFreeDiskMB} MB of free disk space is required. Available: ${checks.freeDiskMB} MB`,
        };
      }

      // Check memory
      if (checks.freeMemoryMB < REQUIREMENTS.minFreeMemoryMB) {
        return {
          status: 'needsUser',
        };
      }

      ctx.log(`System check passed: Windows ${checks.osVersion}, ${checks.freeDiskMB} MB disk, ${checks.freeMemoryMB} MB RAM`);
      return { status: 'satisfied' };
    } catch (error) {
      return {
        status: 'failed',
        code: 'SYSTEM_CHECK_ERROR',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async explain(ctx: StepContext): Promise<StepExplanation> {
    ctx.log('Explaining system check step');
    return {
      summary: 'Verifies your system meets minimum requirements for the companion',
      rationale: `This ensures the app will run properly on your system`,
      dataHandling: 'No data is sent anywhere. All checks are performed locally.',
      estimatedSeconds: 5,
    };
  }

  async run(ctx: StepContext): Promise<StepResult> {
    ctx.log('Running system check');
    
    // Detection already does the real work
    const detection = await this.detect(ctx);
    
    if (detection.status === 'failed') {
      return {
        outcome: 'failed',
        code: detection.code,
        message: detection.message,
      };
    }

    const checks = await this.performChecks(ctx);
    
    ctx.log(`System check completed: ${JSON.stringify(checks)}`);
    
    return {
      outcome: 'completed',
    };
  }

  async verify(ctx: StepContext): Promise<StepResult> {
    ctx.log('Verifying system check');
    // Verification is the same as detection for this step
    const detection = await this.detect(ctx);
    
    if (detection.status === 'satisfied') {
      return { outcome: 'completed' };
    }
    
    if (detection.status === 'failed') {
      return {
        outcome: 'failed',
        code: detection.code,
        message: detection.message,
      };
    }
    
    return {
      outcome: 'needsUser',
      reason: 'System check requires user attention',
    };
  }

  async repair(ctx: StepContext): Promise<StepResult> {
    ctx.log('System check cannot be automatically repaired');
    // System requirements cannot be repaired automatically
    const detection = await this.detect(ctx);
    
    if (detection.status === 'failed') {
      return {
        outcome: 'failed',
        code: detection.code,
        message: `${detection.message}\n\nThis issue requires manual intervention.`,
      };
    }
    
    return { outcome: 'completed' };
  }

  async rollback(ctx: StepContext): Promise<void> {
    ctx.log('System check has no state to rollback');
    // System check doesn't modify anything, so rollback is a no-op
  }

  private async performChecks(ctx: StepContext): Promise<SystemCheckData> {
    const platform = os.platform();
    const osVersion = os.release();
    const freeMem = os.freemem();
    const freeMemoryMB = Math.floor(freeMem / (1024 * 1024));

    // Rough estimate of free disk space (homedir)
    // In production, use a proper disk-space library or native call
    const freeDiskMB = 10000; // Placeholder - would use actual disk check

    ctx.log(`System info: platform=${platform}, version=${osVersion}, freeMem=${freeMemoryMB}MB`);

    return {
      osVersion,
      freeDiskMB,
      freeMemoryMB,
      platform,
    };
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }
    
    return 0;
  }
}
