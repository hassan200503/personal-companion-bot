export type ProposedMemory = {
  id: string;
  category: string;
  content: string;
  origin?: string;
  createdAt?: string;
};

type Props = {
  items: ProposedMemory[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRefresh?: () => void;
};

export function MemoryInbox({ items, onApprove, onReject, onRefresh }: Props) {
  return (
    <div className="memory-inbox">
      <div className="section-head">
        <h3>Memory approval</h3>
        {onRefresh && <button className="ghost" onClick={onRefresh}>Refresh</button>}
      </div>
      {items.length === 0 ? (
        <p className="muted">No proposed memories waiting. Say “remember …” to add one.</p>
      ) : (
        <ul className="inbox-list">
          {items.map((item) => (
            <li key={item.id} className="inbox-item">
              <div>
                <strong>{item.category}</strong>
                <p>{item.content}</p>
                <small className="muted">{item.origin ?? 'explicit'}{item.createdAt ? ` · ${item.createdAt.slice(0, 10)}` : ''}</small>
              </div>
              <div className="actions">
                <button className="primary" onClick={() => onApprove(item.id)}>Approve</button>
                <button className="ghost" onClick={() => onReject(item.id)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
