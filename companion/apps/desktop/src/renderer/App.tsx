import { useState } from "react";
import type { AppInfo } from "../shared/ipc";

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkBridge(): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      setInfo(await window.companion.getInfo());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unknown bridge error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <p className="eyebrow">Scaffold only</p>
      <h1>Companion</h1>
      <p className="lede">
        A Windows-first personal AI companion. No provider is connected and no
        memory is stored yet.
      </p>

      <button type="button" onClick={() => void checkBridge()} disabled={busy}>
        {busy ? "Checking..." : "Check local bridge"}
      </button>

      <div className="status" aria-live="polite">
        {info === null ? null : (
          <p>
            Connected to Electron {info.electronVersion} on {info.platform}. App
            version {info.appVersion}.
          </p>
        )}
        {error === null ? null : (
          <p role="alert" className="error">
            Bridge error: {error}
          </p>
        )}
      </div>
    </main>
  );
}
