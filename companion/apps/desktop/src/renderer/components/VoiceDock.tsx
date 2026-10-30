type Props = {
  voiceMode: boolean;
  speaking: boolean;
  voiceState: string;
  voiceEngine: string;
  cloudConsentNeeded: boolean;
  muted: boolean;
  hasProvider: boolean;
  hasConversation: boolean;
  interimTranscript: string;
  calibrationQuestion: string;
  calibrationStep: string | null;
  voiceWarning: string;
  voiceError: string;
  speechPrivacyNeeded: boolean;
  onEnableCloudSpeech: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onToggleMute: () => void;
  onStopEverything: () => void;
  onOpenMicSettings: () => void;
};

export function VoiceDock(props: Props) {
  const {
    voiceMode, speaking, voiceState, voiceEngine, cloudConsentNeeded, muted,
    hasProvider, hasConversation, interimTranscript, calibrationQuestion, calibrationStep,
    voiceWarning, voiceError, speechPrivacyNeeded,
    onEnableCloudSpeech, onStartListening, onStopListening, onToggleMute, onStopEverything, onOpenMicSettings,
  } = props;

  return (
    <div className={`voice-panel ${voiceMode ? 'listening' : ''} ${speaking ? 'speaking' : ''} ${voiceState === 'processing' ? 'thinking' : ''}`}>
      <div className="voice-hero">
        <div className={`voice-orb ${voiceMode ? 'live' : ''} ${speaking ? 'speak' : ''}`} aria-hidden="true">
          <span className="voice-orb-ring" />
          <span className="voice-orb-core" />
        </div>
        <div className="voice-status">
          <strong className="voice-headline">
            {voiceMode
              ? (speaking ? 'Companion is speaking' : voiceState === 'processing' ? 'Thinking about what you said' : voiceState === 'starting' ? 'Opening the microphone' : 'Listening live')
              : cloudConsentNeeded ? 'Voice needs your OK' : 'Live voice is off'}
          </strong>
          <div className="muted">
            {voiceMode
              ? `Microphone active · ${voiceEngine === 'gemini' ? 'Google Gemini transcription' : `${voiceEngine} engine`} · raw audio is not stored`
              : cloudConsentNeeded
                ? 'Short speech clips are transcribed by Google Gemini. Nothing is saved as an audio file on this PC.'
                : 'Speech is the primary way to talk with Companion. Text is always available.'}
          </div>
        </div>
      </div>
      <div className="voice-actions">
        {cloudConsentNeeded && !voiceMode && (
          <button className="primary" onClick={onEnableCloudSpeech} disabled={!hasConversation || muted || !hasProvider}>
            Enable cloud speech
          </button>
        )}
        {voiceMode
          ? <button className="danger" onClick={onStopListening}>Pause listening</button>
          : !cloudConsentNeeded && <button onClick={onStartListening} disabled={!hasConversation || muted}>Start listening</button>}
        <button onClick={onToggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
        <button className="danger" onClick={onStopEverything}>Stop everything</button>
      </div>
      <div className="living-indicator" aria-live="polite">
        <span className="pulse" /> {voiceMode ? 'Speak naturally. Say "stop" while I am talking if you want me to be quiet.' : 'Microphone off.'}
      </div>
      {calibrationQuestion && <div className="voice-transcript">Setup {calibrationStep ? `(${calibrationStep})` : ''}: {calibrationQuestion}</div>}
      {interimTranscript && <div className="voice-transcript" aria-live="polite">{interimTranscript}</div>}
      {voiceWarning && <div className="voice-consent" role="status">{voiceWarning}</div>}
      {voiceError && <div className="voice-error" role="alert">{voiceError}</div>}
      {speechPrivacyNeeded && (
        <button className="ghost" onClick={onOpenMicSettings}>
          Open Windows microphone privacy settings
        </button>
      )}
    </div>
  );
}
