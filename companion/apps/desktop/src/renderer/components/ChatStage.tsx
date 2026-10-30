type Message = { id: string; role: string; content: string; createdAt?: string };

type Conversation = { id: string; title?: string; messageCount: number };

type Props = {
  conversations: Conversation[];
  activeConv: string | null;
  messages: Message[];
  draft: string;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onNewConversation: () => void;
  onLoadConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
};

export function ChatStage({
  conversations,
  activeConv,
  messages,
  draft,
  busy,
  onDraftChange,
  onSend,
  onNewConversation,
  onLoadConversation,
  onDeleteConversation,
}: Props) {
  const visible = conversations.filter((c) => (c.messageCount ?? 0) > 0 || c.id === activeConv);

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <button className="primary" onClick={onNewConversation} disabled={busy}>New chat</button>
        <div className="conversation-list">
          {visible.length === 0 && <p className="muted">No conversations yet.</p>}
          {visible.map((c) => (
            <div key={c.id} className="conversation-row">
              <button
                className={c.id === activeConv ? 'conversation active' : 'conversation'}
                onClick={() => onLoadConversation(c.id)}
              >
                <span>{c.title || 'Untitled chat'}</span>
                <small>{c.messageCount} messages</small>
              </button>
              <button className="ghost icon-btn" title="Delete chat" onClick={() => onDeleteConversation(c.id)}>×</button>
            </div>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        <div className="message-list" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-stage">
              <h2>Companion</h2>
              <p className="muted">Say something, or type below. I open apps, play media, check mail when connected, and only claim what I can observe.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`message ${m.role}`}>
              <div className="message-role">{m.role === 'assistant' ? 'Companion' : 'You'}</div>
              <div className="message-content">{m.content}</div>
            </div>
          ))}
        </div>
        <div className="composer">
          <textarea
            aria-label="Message"
            placeholder="Speak, or type a command…"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button className="primary" onClick={onSend} disabled={busy || !draft.trim()}>Send</button>
        </div>
      </section>
    </div>
  );
}
