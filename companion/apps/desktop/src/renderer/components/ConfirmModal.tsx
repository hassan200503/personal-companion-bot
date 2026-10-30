type Props = {
  toolName: string;
  summary: string;
  busy?: boolean;
  onConfirm: () => void;
  onReject: () => void;
};

export function ConfirmModal({ toolName, summary, busy, onConfirm, onReject }: Props) {
  return (
    <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-modal-panel">
        <div className="eyebrow">Confirmation required</div>
        <h3 id="confirm-title">Allow {toolName}?</h3>
        <p className="muted">{summary}</p>
        <div className="actions">
          <button className="primary" onClick={onConfirm} disabled={busy}>Confirm</button>
          <button className="danger" onClick={onReject} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
