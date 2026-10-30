import type { ReactNode } from 'react';
import { MemoryInbox, type ProposedMemory } from './MemoryInbox';

export type EmailForm = {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  configured?: boolean;
};

type VoiceSettingsLike = {
  voice?: string;
  rate?: number;
  pitch?: number;
  cloudSpeechConsent?: boolean;
  autoStart?: boolean;
  bargeIn?: boolean;
  proactiveQuestions?: boolean;
  quietHours?: { start?: string; end?: string };
};

type PersonaLike = {
  calibration?: { completedAt?: string };
  profile?: {
    ownerName?: string;
    companionName?: string;
    tone?: string;
    selfDescription?: string;
    favoritePhrases?: string[];
    avoidTopics?: string[];
  };
};

type Props = {
  section: 'voice' | 'persona' | 'privacy' | 'email' | 'providers' | 'memory' | 'data';
  onSection: (section: Props['section']) => void;
  voiceSettings: VoiceSettingsLike;
  voiceVoices: Array<{ name: string; language: string; id: string }>;
  onVoiceSettings: (next: VoiceSettingsLike) => void;
  onSaveVoice: () => void;
  onTestVoice: () => void;
  persona: PersonaLike | null;
  calibrationQuestion: string;
  onPersona: (next: PersonaLike) => void;
  onSavePersona: () => void;
  onBeginCalibration: () => void;
  email: EmailForm;
  emailStatus: string;
  onEmail: (next: EmailForm) => void;
  onSaveEmail: () => void;
  onTestEmail: () => void;
  onClearEmail: () => void;
  proposed: ProposedMemory[];
  onApproveMemory: (id: string) => void;
  onRejectMemory: (id: string) => void;
  onRefreshMemory: () => void;
  owner: Record<string, unknown>;
  onOwner: (next: Record<string, unknown>) => void;
  onSaveOwner: () => void;
  grantable: string[];
  onGrant: (permission: string) => void;
  onExport: () => void;
  onDeleteAll: () => void;
  onCheckUpdates: () => void;
  updateLabel: string;
  children?: ReactNode;
};

const SECTIONS: Array<{ id: Props['section']; label: string }> = [
  { id: 'voice', label: 'Voice' },
  { id: 'persona', label: 'Persona' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'email', label: 'Email' },
  { id: 'providers', label: 'Providers' },
  { id: 'memory', label: 'Memory' },
  { id: 'data', label: 'Data' },
];

export function SettingsShell(props: Props) {
  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="Settings">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={props.section === s.id ? 'nav-item active' : 'nav-item'}
            onClick={() => props.onSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        {props.section === 'voice' && (
          <section className="settings-panel">
            <h3>Voice</h3>
            <p className="muted">Neural Windows voices are preferred when available. Conversation TTS uses WinRT SSML.</p>
            <select aria-label="Voice" value={props.voiceSettings?.voice || ''} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, voice: e.target.value })}>
              <option value="">System default (prefer neural)</option>
              {props.voiceVoices.map((voice) => (
                <option key={voice.id || voice.name} value={voice.name}>{voice.name} ({voice.language})</option>
              ))}
            </select>
            <label className="field-label">Rate
              <input type="range" min={-10} max={10} value={Number(props.voiceSettings?.rate ?? 0)} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, rate: Number(e.target.value) })} />
            </label>
            <label className="field-label">Pitch
              <input type="range" min={-10} max={10} value={Number(props.voiceSettings?.pitch ?? 0)} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, pitch: Number(e.target.value) })} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={props.voiceSettings?.cloudSpeechConsent === true} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, cloudSpeechConsent: e.target.checked })} />
              Cloud speech (Gemini transcription)
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={props.voiceSettings?.autoStart !== false} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, autoStart: e.target.checked })} />
              Start listening automatically
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={props.voiceSettings?.bargeIn !== false} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, bargeIn: e.target.checked })} />
              Allow spoken interruption
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={props.voiceSettings?.proactiveQuestions !== false} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, proactiveQuestions: e.target.checked })} />
              Ask me questions by voice
            </label>
            <label className="field-label">Quiet hours start
              <input type="time" value={props.voiceSettings?.quietHours?.start ?? ''} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, quietHours: e.target.value ? { start: e.target.value, end: props.voiceSettings?.quietHours?.end || '07:00' } : undefined })} />
            </label>
            <label className="field-label">Quiet hours end
              <input type="time" value={props.voiceSettings?.quietHours?.end ?? ''} onChange={(e) => props.onVoiceSettings({ ...props.voiceSettings, quietHours: e.target.value ? { start: props.voiceSettings?.quietHours?.start || '22:00', end: e.target.value } : undefined })} />
            </label>
            <div className="actions">
              <button onClick={props.onSaveVoice}>Save voice</button>
              <button className="ghost" onClick={props.onTestVoice}>Test voice</button>
            </div>
          </section>
        )}

        {props.section === 'persona' && (
          <section className="settings-panel">
            <h3>Persona</h3>
            <div className="muted">{props.persona?.calibration?.completedAt ? 'Calibrated' : props.calibrationQuestion ? 'Setup in progress' : 'Not calibrated yet'}</div>
            <input placeholder="Your name" value={props.persona?.profile?.ownerName || ''} onChange={(e) => props.onPersona({ ...props.persona, profile: { ...props.persona?.profile, ownerName: e.target.value } })} />
            <input placeholder="Companion name" value={props.persona?.profile?.companionName || 'Companion'} onChange={(e) => props.onPersona({ ...props.persona, profile: { ...props.persona?.profile, companionName: e.target.value } })} />
            <select aria-label="Tone" value={props.persona?.profile?.tone || 'warm'} onChange={(e) => props.onPersona({ ...props.persona, profile: { ...props.persona?.profile, tone: e.target.value } })}>
              {['warm', 'direct', 'playful', 'calm', 'dry', 'energetic', 'custom'].map((tone) => <option key={tone} value={tone}>{tone}</option>)}
            </select>
            <textarea placeholder="How do you actually talk?" value={props.persona?.profile?.selfDescription || ''} onChange={(e) => props.onPersona({ ...props.persona, profile: { ...props.persona?.profile, selfDescription: e.target.value } })} />
            <div className="actions">
              <button onClick={props.onSavePersona}>Save personality</button>
              <button className="ghost" onClick={props.onBeginCalibration}>{props.calibrationQuestion ? 'Continue setup' : 'Start voice setup'}</button>
            </div>
          </section>
        )}

        {props.section === 'privacy' && (
          <section className="settings-panel">
            <h3>Privacy & permissions</h3>
            <p className="muted">WhatsApp messaging and phone calls stay off until you grant them. Class‑3 actions still need confirmation every time.</p>
            {props.grantable.length === 0 ? (
              <p className="muted">All optional OS permissions are granted.</p>
            ) : (
              <ul className="inbox-list">
                {props.grantable.map((permission) => (
                  <li key={permission} className="inbox-item">
                    <div>
                      <strong>{permission}</strong>
                      <p className="muted">First-use grant for Class‑3 messaging / telephony / send.</p>
                    </div>
                    <button className="primary" onClick={() => props.onGrant(permission)}>Grant</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {props.section === 'email' && (
          <section className="settings-panel">
            <h3>Email (IMAP)</h3>
            <p className="muted">App password is stored in Windows Credential Manager. Companion never invents inbox contents when disconnected.</p>
            <label className="field-label">Host
              <input value={props.email.host} onChange={(e) => props.onEmail({ ...props.email, host: e.target.value })} placeholder="imap.gmail.com" />
            </label>
            <label className="field-label">Port
              <input type="number" value={props.email.port} onChange={(e) => props.onEmail({ ...props.email, port: Number(e.target.value) || 993 })} />
            </label>
            <label className="field-label">User
              <input value={props.email.user} onChange={(e) => props.onEmail({ ...props.email, user: e.target.value })} placeholder="you@example.com" />
            </label>
            <label className="field-label">App password
              <input type="password" value={props.email.password} onChange={(e) => props.onEmail({ ...props.email, password: e.target.value })} placeholder={props.email.configured ? '•••••••• (leave blank to keep)' : 'App password'} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={props.email.tls !== false} onChange={(e) => props.onEmail({ ...props.email, tls: e.target.checked })} />
              TLS (IMAPS)
            </label>
            {props.emailStatus && <p className="muted">{props.emailStatus}</p>}
            <div className="actions">
              <button onClick={props.onSaveEmail}>Save</button>
              <button className="ghost" onClick={props.onTestEmail}>Test connection</button>
              <button className="danger" onClick={props.onClearEmail}>Disconnect</button>
            </div>
          </section>
        )}

        {props.section === 'providers' && (
          <section className="settings-panel">
            <h3>Providers</h3>
            <p className="muted">Connect Gemini or another provider from Setup, then return here for status.</p>
            {props.children}
          </section>
        )}

        {props.section === 'memory' && (
          <section className="settings-panel">
            <h3>Memory & owner</h3>
            <MemoryInbox
              items={props.proposed}
              onApprove={props.onApproveMemory}
              onReject={props.onRejectMemory}
              onRefresh={props.onRefreshMemory}
            />
            <div className="owner-form">
              <input placeholder="Name" value={String(props.owner?.name || '')} onChange={(e) => props.onOwner({ ...props.owner, name: e.target.value })} />
              <input placeholder="Occupation" value={String(props.owner?.occupation || '')} onChange={(e) => props.onOwner({ ...props.owner, occupation: e.target.value })} />
              <input placeholder="Goals (comma separated)" value={Array.isArray(props.owner?.goals) ? (props.owner.goals as string[]).join(', ') : String(props.owner?.goals || '')} onChange={(e) => props.onOwner({ ...props.owner, goals: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              <button onClick={props.onSaveOwner}>Save owner</button>
            </div>
          </section>
        )}

        {props.section === 'data' && (
          <section className="settings-panel">
            <h3>Data</h3>
            <p className="muted">Export or erase local companion data. Audit detail stays here — not on the Talk surface.</p>
            <div className="actions">
              <button onClick={props.onExport}>Export data</button>
              <button className="danger" onClick={props.onDeleteAll}>Delete all local data</button>
              <button className="ghost" onClick={props.onCheckUpdates}>Check updates</button>
            </div>
            {props.updateLabel && <p className="muted">{props.updateLabel}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
