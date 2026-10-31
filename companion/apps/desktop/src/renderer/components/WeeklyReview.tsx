/**
 * Weekly Review UI Component
 *
 * Allows the owner to review and approve/reject learned facts
 * from the consolidation engine (topics, tools, recipes, facts).
 */

import { useState } from 'react';

export interface LearnedFact {
  id: string;
  type: 'topic' | 'tool' | 'recipe' | 'fact';
  description: string;
  evidence: string[];
  confidence: number;
  source: string;
  createdAt: string;
}

interface WeeklyReviewProps {
  facts: LearnedFact[];
  onApprove: (factId: string) => void;
  onReject: (factId: string) => void;
  onBulkApprove: (factIds: string[]) => void;
  onBulkReject: (factIds: string[]) => void;
}

export function WeeklyReview({
  facts,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
}: WeeklyReviewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'topic' | 'tool' | 'recipe' | 'fact'>('all');
  const [showDetails, setShowDetails] = useState<Set<string>>(new Set());

  const filteredFacts = facts.filter(f => 
    filter === 'all' || f.type === filter
  );

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleDetails = (id: string) => {
    const next = new Set(showDetails);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setShowDetails(next);
  };

  const handleBulkApprove = () => {
    onBulkApprove(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleBulkReject = () => {
    onBulkReject(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'topic': return '📚';
      case 'tool': return '🔧';
      case 'recipe': return '📝';
      case 'fact': return '💡';
      default: return '❓';
    }
  };

  return (
    <div className="weekly-review">
      <div className="review-header">
        <h2>Weekly Review - Learned Facts</h2>
        <div className="review-stats">
          <span>Total: {facts.length}</span>
          <span>Selected: {selectedIds.size}</span>
        </div>
      </div>

      <div className="review-filters">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({facts.length})
        </button>
        <button 
          className={filter === 'topic' ? 'active' : ''}
          onClick={() => setFilter('topic')}
        >
          Topics ({facts.filter(f => f.type === 'topic').length})
        </button>
        <button 
          className={filter === 'tool' ? 'active' : ''}
          onClick={() => setFilter('tool')}
        >
          Tools ({facts.filter(f => f.type === 'tool').length})
        </button>
        <button 
          className={filter === 'recipe' ? 'active' : ''}
          onClick={() => setFilter('recipe')}
        >
          Recipes ({facts.filter(f => f.type === 'recipe').length})
        </button>
        <button 
          className={filter === 'fact' ? 'active' : ''}
          onClick={() => setFilter('fact')}
        >
          Facts ({facts.filter(f => f.type === 'fact').length})
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulk-actions">
          <button 
            className="approve-btn"
            onClick={handleBulkApprove}
          >
            Approve {selectedIds.size} Selected
          </button>
          <button 
            className="reject-btn"
            onClick={handleBulkReject}
          >
            Reject {selectedIds.size} Selected
          </button>
        </div>
      )}

      <div className="review-list">
        {filteredFacts.length === 0 ? (
          <div className="empty-state">
            No facts to review in this category.
          </div>
        ) : (
          filteredFacts.map(fact => (
            <div 
              key={fact.id}
              className={`review-item ${selectedIds.has(fact.id) ? 'selected' : ''}`}
            >
              <div className="item-header">
                <input
                  type="checkbox"
                  checked={selectedIds.has(fact.id)}
                  onChange={() => toggleSelection(fact.id)}
                />
                <span className="type-icon">{getTypeIcon(fact.type)}</span>
                <span className="fact-type">{fact.type}</span>
                <span className={`confidence ${getConfidenceColor(fact.confidence)}`}>
                  {Math.round(fact.confidence * 100)}% confidence
                </span>
                <button 
                  className="toggle-details"
                  onClick={() => toggleDetails(fact.id)}
                >
                  {showDetails.has(fact.id) ? '▼' : '▶'}
                </button>
              </div>

              <div className="item-content">
                <p className="description">{fact.description}</p>
                <p className="source">Source: {fact.source}</p>
                <p className="date">
                  {new Date(fact.createdAt).toLocaleDateString()}
                </p>
              </div>

              {showDetails.has(fact.id) && (
                <div className="item-details">
                  <h4>Evidence ({fact.evidence.length})</h4>
                  <ul>
                    {fact.evidence.map((evidence, idx) => (
                      <li key={idx}>{evidence}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="item-actions">
                <button 
                  className="approve-btn"
                  onClick={() => onApprove(fact.id)}
                >
                  Approve
                </button>
                <button 
                  className="reject-btn"
                  onClick={() => onReject(fact.id)}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
