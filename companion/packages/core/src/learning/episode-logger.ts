/**
 * Episode Logger
 *
 * Records conversation episodes for learning and pattern analysis.
 * An episode is a coherent conversation session that can be analyzed
 * to extract behavioral patterns, preferences, and automation recipes.
 */

import type { ConversationMessage } from '../conversation/contracts.js';

export interface Episode {
  id: string;
  conversationId: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  summary?: string;
  topics: string[];
  toolUses: ToolUse[];
  userIntent?: string;
  outcome?: 'success' | 'partial' | 'failed';
}

export interface ToolUse {
  toolName: string;
  timestamp: string;
  success: boolean;
  riskClass: number;
}

export interface EpisodeLogger {
  startEpisode(conversationId: string): string;
  recordMessage(episodeId: string, message: ConversationMessage): void;
  recordToolUse(episodeId: string, toolName: string, success: boolean, riskClass: number): void;
  endEpisode(episodeId: string, outcome?: Episode['outcome']): Episode;
  getEpisode(episodeId: string): Episode | null;
  listEpisodes(conversationId?: string): Episode[];
}

export class DefaultEpisodeLogger implements EpisodeLogger {
  private episodes = new Map<string, Episode>();
  private activeEpisodes = new Map<string, string>(); // conversationId -> episodeId

  startEpisode(conversationId: string): string {
    const episodeId = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    const episode: Episode = {
      id: episodeId,
      conversationId,
      startedAt: now,
      endedAt: now,
      messageCount: 0,
      topics: [],
      toolUses: [],
    };

    this.episodes.set(episodeId, episode);
    this.activeEpisodes.set(conversationId, episodeId);

    return episodeId;
  }

  recordMessage(episodeId: string, message: ConversationMessage): void {
    const episode = this.episodes.get(episodeId);
    if (!episode) return;

    episode.messageCount++;
    episode.endedAt = message.createdAt;

    // Extract topics from message content (simple keyword extraction)
    if (message.role === 'user') {
      const topics = this.extractTopics(message.content);
      episode.topics.push(...topics);
    }

    // Capture user intent from first user message
    if (message.role === 'user' && !episode.userIntent) {
      episode.userIntent = message.content.slice(0, 200); // First 200 chars
    }
  }

  recordToolUse(episodeId: string, toolName: string, success: boolean, riskClass: number): void {
    const episode = this.episodes.get(episodeId);
    if (!episode) return;

    episode.toolUses.push({
      toolName,
      timestamp: new Date().toISOString(),
      success,
      riskClass,
    });
  }

  endEpisode(episodeId: string, outcome?: Episode['outcome']): Episode {
    const episode = this.episodes.get(episodeId);
    if (!episode) {
      throw new Error(`Episode ${episodeId} not found`);
    }

    episode.endedAt = new Date().toISOString();
    if (outcome) {
      episode.outcome = outcome;
    } else {
      // Auto-determine outcome based on tool success rate
      const successfulTools = episode.toolUses.filter(t => t.success).length;
      episode.outcome = successfulTools === episode.toolUses.length ? 'success' :
                       successfulTools > 0 ? 'partial' : 'failed';
    }

    // Remove from active episodes
    this.activeEpisodes.delete(episode.conversationId);

    return episode;
  }

  getEpisode(episodeId: string): Episode | null {
    return this.episodes.get(episodeId) || null;
  }

  listEpisodes(conversationId?: string): Episode[] {
    const allEpisodes = Array.from(this.episodes.values());
    if (conversationId) {
      return allEpisodes.filter(ep => ep.conversationId === conversationId);
    }
    return allEpisodes;
  }

  /**
   * Extract topics from message content using simple keyword extraction
   */
  private extractTopics(content: string): string[] {
    const topicKeywords = [
      'email', 'calendar', 'schedule', 'meeting', 'call', 'message',
      'file', 'document', 'open', 'close', 'play', 'music', 'video',
      'search', 'web', 'browser', 'notepad', 'calculator', 'settings',
      'weather', 'news', 'reminder', 'task', 'todo', 'buy', 'purchase',
      'send', 'whatsapp', 'telegram', 'slack', 'drive', 'dropbox',
    ];

    const lowerContent = content.toLowerCase();
    const foundTopics = topicKeywords.filter(keyword =>
      lowerContent.includes(keyword)
    );

    // Remove duplicates
    return [...new Set(foundTopics)];
  }

  /**
   * Generate a summary for an episode
   */
  generateSummary(episode: Episode): string {
    const topicStr = episode.topics.length > 0
      ? `Topics: ${episode.topics.join(', ')}`
      : 'No topics detected';

    const toolStr = episode.toolUses.length > 0
      ? `Tools: ${episode.toolUses.map(t => t.toolName).join(', ')}`
      : 'No tools used';

    return `${topicStr}. ${toolStr}. Outcome: ${episode.outcome}.`;
  }

  /**
   * Clear all episodes (for testing)
   */
  clear(): void {
    this.episodes.clear();
    this.activeEpisodes.clear();
  }
}
