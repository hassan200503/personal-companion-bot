export type ProactiveAlert = {
  id: string;
  topic: string;
  message: string;
  reason?: string;
  channel?: string;
};

type Props = {
  alerts: ProactiveAlert[];
  onDismiss: (id: string) => void;
  onSpeak?: (message: string) => void;
};

export function AlertsRail({ alerts, onDismiss, onSpeak }: Props) {
  if (alerts.length === 0) return null;
  return (
    <aside className="alerts-rail" aria-live="polite">
      {alerts.map((alert) => (
        <div key={alert.id} className="alert-chip">
          <div>
            <div className="eyebrow">{alert.topic}</div>
            <p>{alert.message}</p>
          </div>
          <div className="actions">
            {onSpeak && <button className="ghost" onClick={() => onSpeak(alert.message)}>Hear</button>}
            <button className="ghost" onClick={() => onDismiss(alert.id)}>Dismiss</button>
          </div>
        </div>
      ))}
    </aside>
  );
}
