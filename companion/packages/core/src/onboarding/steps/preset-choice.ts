import type {
  SetupStep,
  StepContext,
  StepDetectionResult,
  StepResult,
  StepExplanation,
} from '../contracts.js';

export type PresetType = 'recommended' | 'privacy-first' | 'minimal';

export interface PresetConfig {
  memoryApproval: 'all' | 'inferences-only' | 'none';
  reflectionEnabled: boolean;
  reflectionQuotaShare: number; // 0-1
  confirmationLevel: 'class-3-only' | 'class-2-and-3' | 'all';
  hostedProviders: 'all' | 'non-sensitive-only' | 'none';
}

export const PRESETS: Record<PresetType, PresetConfig> = {
  'recommended': {
    memoryApproval: 'inferences-only',
    reflectionEnabled: true,
    reflectionQuotaShare: 0.1, // 10% of quota for reflection
    confirmationLevel: 'class-3-only',
    hostedProviders: 'all',
  },
  'privacy-first': {
    memoryApproval: 'all',
    reflectionEnabled: false,
    reflectionQuotaShare: 0,
    confirmationLevel: 'class-2-and-3',
    hostedProviders: 'non-sensitive-only',
  },
  'minimal': {
    memoryApproval: 'none',
    reflectionEnabled: false,
    reflectionQuotaShare: 0,
    confirmationLevel: 'class-3-only',
    hostedProviders: 'all',
  },
};

/**
 * Preset choice step - lets user choose between Recommended, Privacy-first, and Minimal presets
 * Required for setup, but skippable (defaults to 'recommended')
 */
export class PresetChoiceStep implements SetupStep {
  readonly id = 'preset-choice';
  readonly title = 'Choose your setup preset';
  readonly ownerModule = 'onboarding';
  readonly dependsOn = ['system-check'] as const;
  readonly required = true;
  readonly skippable = true;
  readonly estimatedSeconds = 30;

  private selectedPreset: PresetType | null = null;

  async detect(ctx: StepContext): Promise<StepDetectionResult> {
    if (this.selectedPreset !== null) {
      ctx.log(`Preset already selected: ${this.selectedPreset}`);
      return { status: 'satisfied' };
    }

    ctx.log('Preset not yet selected');
    return { status: 'notStarted' };
  }

  async explain(ctx: StepContext): Promise<StepExplanation> {
    ctx.log('Explaining preset choices');
    return {
      summary: 'Choose between Recommended, Privacy-first, or Minimal presets',
      rationale: 'This configures how the companion manages memory, reflection, and confirmations to match your preferences',
      dataHandling: 'Your choice affects how data is processed locally and what is sent to AI providers. The choice itself is stored locally only.',
      estimatedSeconds: 30,
    };
  }

  async run(
    ctx: StepContext,
    preset?: PresetType
  ): Promise<StepResult> {
    // If preset provided (from UI), validate and use it
    const chosenPreset = preset || 'recommended';
    
    if (!PRESETS[chosenPreset]) {
      return {
        outcome: 'failed',
        code: 'INVALID_PRESET',
        message: `Invalid preset: ${chosenPreset}. Valid options: recommended, privacy-first, minimal`,
      };
    }

    this.selectedPreset = chosenPreset;
    const config = PRESETS[chosenPreset];
    
    ctx.log(`Preset selected: ${chosenPreset}`);
    ctx.log(`Config: ${JSON.stringify(config)}`);
    
    return {
      outcome: 'completed',
    };
  }

  async verify(ctx: StepContext): Promise<StepResult> {
    if (this.selectedPreset === null) {
      return {
        outcome: 'failed',
        code: 'PRESET_NOT_SELECTED',
        message: 'Preset choice was not completed',
      };
    }

    ctx.log(`Preset verified: ${this.selectedPreset}`);
    return { outcome: 'completed' };
  }

  async repair(ctx: StepContext): Promise<StepResult> {
    ctx.log('Attempting to repair preset choice');
    
    // If preset is missing, default to 'recommended'
    if (this.selectedPreset === null) {
      ctx.log('Defaulting to recommended preset');
      return this.run(ctx, 'recommended');
    }

    return { outcome: 'completed' };
  }

  async rollback(ctx: StepContext): Promise<void> {
    ctx.log('Rolling back preset choice');
    this.selectedPreset = null;
  }

  // Helper method for UI integration
  getSelectedPreset(): PresetType | null {
    return this.selectedPreset;
  }

  // Helper method for UI integration
  getPresetConfig(preset: PresetType): PresetConfig | null {
    return PRESETS[preset] || null;
  }
}
