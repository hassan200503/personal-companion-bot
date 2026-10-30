import {
  getVoiceGuideStep,
  voiceGuideStepIndex,
  voiceGuideSteps,
  type VoiceGuideProgress,
} from '@companion/core/onboarding/voice-guide';

type Props = {
  guideActive: boolean;
  voiceGuide: VoiceGuideProgress;
  guidePrompt: string;
  guideAnswer: string;
  busy: boolean;
  speaking: boolean;
  voiceMode: boolean;
  muted: boolean;
  hasProvider: boolean;
  onGuideAnswerChange: (value: string) => void;
  onSubmitGuide: (answer: string) => void;
  onStartVoiceOnboarding: () => void;
  onStartTalking: () => void;
  onRunSystemCheck: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onHearAgain: () => void;
};

export function OnboardingHero(props: Props) {
  const step = getVoiceGuideStep(props.voiceGuide.currentStep);
  const progress = Math.round(((voiceGuideStepIndex(props.voiceGuide.currentStep) + 1) / voiceGuideSteps.length) * 100);

  return (
    <section className="hero-stage voice-guide-hero">
      <h1 className="brand-hero">Companion</h1>
      <p className="hero-line">
        {props.guideActive ? 'I will guide you by voice' : 'Talk first. Type only when you want to.'}
      </p>
      <p className="lede">
        {props.guideActive
          ? 'I speak each step aloud. Answer out loud once cloud speech is on, or type below.'
          : 'Connect a provider, enable cloud speech, then speak naturally. I only claim OS actions I can observe.'}
      </p>
      {props.guideActive ? (
        <div className="voice-guide">
          <div className="voice-guide-progress" aria-hidden="true">
            <div className="voice-guide-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="muted">
            Step {voiceGuideStepIndex(props.voiceGuide.currentStep) + 1} of {voiceGuideSteps.length} · {step.title}
          </div>
          <p className="voice-guide-prompt">{props.guidePrompt || step.prompt}</p>
          <div className="composer voice-guide-composer">
            <textarea
              aria-label="Onboarding answer"
              placeholder={step.hint}
              value={props.guideAnswer}
              onChange={(e) => props.onGuideAnswerChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  props.onSubmitGuide(props.guideAnswer || 'continue');
                }
              }}
            />
            <button className="primary" onClick={() => props.onSubmitGuide(props.guideAnswer || 'continue')} disabled={props.busy || props.speaking}>
              Continue
            </button>
          </div>
          <div className="actions">
            {props.voiceGuide.draft.cloudSpeechConsent && props.hasProvider && !props.voiceMode && (
              <button onClick={props.onStartListening} disabled={props.muted}>Start listening for answers</button>
            )}
            {props.voiceMode && <button className="danger" onClick={props.onStopListening}>Pause listening</button>}
            <button className="ghost" onClick={props.onHearAgain}>Hear again</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="primary" onClick={props.onStartVoiceOnboarding} disabled={props.busy}>Start voice onboarding</button>
          <button className="ghost" onClick={props.onStartTalking} disabled={props.busy}>Start talking</button>
          <button className="ghost" onClick={props.onRunSystemCheck} disabled={props.busy}>Run system check only</button>
        </div>
      )}
    </section>
  );
}
