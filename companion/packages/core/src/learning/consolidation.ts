/**
 * Consolidation Engine
 *
 * Analyzes conversation episodes to extract behavioral patterns,
 * preferences, and propose facts for the learning system.
 */

import type { Episode } from './episode-logger.js';

export interface ConsolidationResult {
  episodesAnalyzed: number;
  proposedFacts: ProposedFact[];
  patterns: BehaviorPattern[];
  timestamp: string;
}

export interface ProposedFact {
  category: string;
  content: string;
  evidence: EvidenceSource[];
  confidence: number;
  requiresApproval: boolean;
}

export interface EvidenceSource {
  episodeId: string;
  timestamp: string;
  context: string;
}

export interface BehaviorPattern {
  type: 'preference' | 'habit' | 'routine';
  description: string;
  frequency: number;
  lastSeen: string;
}

export interface ConsolidationConfig {
  minEvidenceCount: number;
  minConfidence: number;
  maxEpisodesPerRun: number;
}

export class ConsolidationEngine {
  private config: ConsolidationConfig;

  constructor(config?: Partial<ConsolidationConfig>) {
    this.config = {
      minEvidenceCount: 3,
      minConfidence: 0.7,
      maxEpisodesPerRun: 100,
      ...config,
    };
  }

  /**
   * Run consolidation on a set of episodes
   */
  async consolidate(episodes: Episode[]): Promise<ConsolidationResult> {
    const limitedEpisodes = episodes.slice(0, this.config.maxEpisodesPerRun);
    
    const patterns = this.extractPatterns(limitedEpisodes);
    const proposedFacts = this.proposeFacts(limitedEpisodes, patterns);

    return {
      episodesAnalyzed: limitedEpisodes.length,
      proposedFacts,
      patterns,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Extract behavioral patterns from episodes
   */
  private extractPatterns(episodes: Episode[]): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];
    const topicFrequency = new Map<string, number>();
    const toolFrequency = new Map<string, number>();

    // Count topics and tools
    for (const episode of episodes) {
      for (const topic of episode.topics) {
        topicFrequency.set(topic, (topicFrequency.get(topic) || 0) + 1);
      }
      for (const toolUse of episode.toolUses) {
        toolFrequency.set(toolUse.toolName, (toolFrequency.get(toolUse.toolName) || 0) + 1);
      }
    }

    // Extract topic patterns (preferences)
    for (const [topic, count] of topicFrequency.entries()) {
      if (count >= this.config.minEvidenceCount) {
        patterns.push({
          type: 'preference',
          description: `Frequently discusses ${topic}`,
          frequency: count,
          lastSeen: this.getLastSeenForTopic(episodes, topic),
        });
      }
    }

    // Extract tool patterns (habits)
    for (const [tool, count] of toolFrequency.entries()) {
      if (count >= this.config.minEvidenceCount) {
        patterns.push({
          type: 'habit',
          description: `Frequently uses ${tool}`,
          frequency: count,
          lastSeen: this.getLastSeenForTool(episodes, tool),
        });
      }
    }

    // Extract time-based patterns (routines)
    const timePatterns = this.extractTimePatterns(episodes);
    patterns.push(...timePatterns);

    return patterns;
  }

  /**
   * Propose facts based on patterns and episodes
   */
  private proposeFacts(episodes: Episode[], patterns: BehaviorPattern[]): ProposedFact[] {
    const facts: ProposedFact[] = [];

    // Propose facts from patterns
    for (const pattern of patterns) {
      if (pattern.type === 'preference') {
        const topic = this.extractTopicFromDescription(pattern.description);
        const evidence = this.getEvidenceForTopic(episodes, topic);
        
        if (evidence.length >= this.config.minEvidenceCount) {
          facts.push({
            category: 'preference',
            content: pattern.description,
            evidence,
            confidence: this.calculateConfidence(evidence.length, episodes.length),
            requiresApproval: true,
          });
        }
      } else if (pattern.type === 'habit') {
        const tool = this.extractToolFromDescription(pattern.description);
        const evidence = this.getEvidenceForTool(episodes, tool);
        
        if (evidence.length >= this.config.minEvidenceCount) {
          facts.push({
            category: 'habit',
            content: pattern.description,
            evidence,
            confidence: this.calculateConfidence(evidence.length, episodes.length),
            requiresApproval: true,
          });
        }
      }
    }

    // Propose facts from successful tool sequences
    const recipePatterns = this.extractRecipePatterns(episodes);
    for (const recipe of recipePatterns) {
      facts.push({
        category: 'recipe',
        content: recipe.description,
        evidence: recipe.evidence,
        confidence: recipe.confidence,
        requiresApproval: true,
      });
    }

    return facts;
  }

  /**
   * Extract time-based patterns (e.g., "checks email in the morning")
   */
  private extractTimePatterns(episodes: Episode[]): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];
    const hourFrequency = new Map<number, Set<string>>();

    for (const episode of episodes) {
      const hour = new Date(episode.startedAt).getHours();
      if (!hourFrequency.has(hour)) {
        hourFrequency.set(hour, new Set());
      }
      for (const topic of episode.topics) {
        hourFrequency.get(hour)!.add(topic);
      }
    }

    // Find consistent hour-topic associations
    for (const [hour, topics] of hourFrequency.entries()) {
      for (const topic of topics) {
        const count = this.countHourTopicOccurrences(episodes, hour, topic);
        if (count >= this.config.minEvidenceCount) {
          patterns.push({
            type: 'routine',
            description: `Often discusses ${topic} around ${hour}:00`,
            frequency: count,
            lastSeen: this.getLastSeenForHourTopic(episodes, hour, topic),
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Extract recipe patterns (successful tool sequences)
   */
  private extractRecipePatterns(episodes: Episode[]): Array<{ description: string; evidence: EvidenceSource[]; confidence: number }> {
    const recipes: Array<{ description: string; evidence: EvidenceSource[]; confidence: number }> = [];
    const sequenceFrequency = new Map<string, { count: number; episodes: Episode[] }>();

    for (const episode of episodes) {
      if (episode.outcome !== 'success') continue;
      
      // Create a sequence signature from tool uses
      const sequence = episode.toolUses.map(t => t.toolName).join(' → ');
      
      if (!sequenceFrequency.has(sequence)) {
        sequenceFrequency.set(sequence, { count: 0, episodes: [] });
      }
      const entry = sequenceFrequency.get(sequence)!;
      entry.count++;
      entry.episodes.push(episode);
    }

    // Propose recipes for frequent successful sequences
    for (const [sequence, data] of sequenceFrequency.entries()) {
      if (data.count >= this.config.minEvidenceCount) {
        recipes.push({
          description: `Successful workflow: ${sequence}`,
          evidence: data.episodes.map(ep => ({
            episodeId: ep.id,
            timestamp: ep.startedAt,
            context: ep.userIntent || 'No context',
          })),
          confidence: this.calculateConfidence(data.count, episodes.length),
        });
      }
    }

    return recipes;
  }

  /**
   * Get last seen timestamp for a topic
   */
  private getLastSeenForTopic(episodes: Episode[], topic: string): string {
    let lastSeen = '';
    for (const episode of episodes) {
      if (episode.topics.includes(topic) && episode.startedAt > lastSeen) {
        lastSeen = episode.startedAt;
      }
    }
    return lastSeen;
  }

  /**
   * Get last seen timestamp for a tool
   */
  private getLastSeenForTool(episodes: Episode[], tool: string): string {
    let lastSeen = '';
    for (const episode of episodes) {
      const toolUse = episode.toolUses.find(t => t.toolName === tool);
      if (toolUse && toolUse.timestamp > lastSeen) {
        lastSeen = toolUse.timestamp;
      }
    }
    return lastSeen;
  }

  /**
   * Get evidence for a topic
   */
  private getEvidenceForTopic(episodes: Episode[], topic: string): EvidenceSource[] {
    const evidence: EvidenceSource[] = [];
    for (const episode of episodes) {
      if (episode.topics.includes(topic)) {
        evidence.push({
          episodeId: episode.id,
          timestamp: episode.startedAt,
          context: episode.userIntent || 'No context',
        });
      }
    }
    return evidence;
  }

  /**
   * Get evidence for a tool
   */
  private getEvidenceForTool(episodes: Episode[], tool: string): EvidenceSource[] {
    const evidence: EvidenceSource[] = [];
    for (const episode of episodes) {
      const toolUse = episode.toolUses.find(t => t.toolName === tool);
      if (toolUse) {
        evidence.push({
          episodeId: episode.id,
          timestamp: toolUse.timestamp,
          context: episode.userIntent || 'No context',
        });
      }
    }
    return evidence;
  }

  /**
   * Count occurrences of a topic at a specific hour
   */
  private countHourTopicOccurrences(episodes: Episode[], hour: number, topic: string): number {
    let count = 0;
    for (const episode of episodes) {
      const episodeHour = new Date(episode.startedAt).getHours();
      if (episodeHour === hour && episode.topics.includes(topic)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get last seen timestamp for a hour-topic combination
   */
  private getLastSeenForHourTopic(episodes: Episode[], hour: number, topic: string): string {
    let lastSeen = '';
    for (const episode of episodes) {
      const episodeHour = new Date(episode.startedAt).getHours();
      if (episodeHour === hour && episode.topics.includes(topic) && episode.startedAt > lastSeen) {
        lastSeen = episode.startedAt;
      }
    }
    return lastSeen;
  }

  /**
   * Extract topic from description
   */
  private extractTopicFromDescription(description: string): string {
    const match = description.match(/Frequently discusses (\w+)/);
    return match?.[1] ?? '';
  }

  /**
   * Extract tool from description
   */
  private extractToolFromDescription(description: string): string {
    const match = description.match(/Frequently uses (\w+)/);
    return match?.[1] ?? '';
  }

  /**
   * Calculate confidence based on evidence
   */
  private calculateConfidence(evidenceCount: number, totalEpisodes: number): number {
    if (totalEpisodes === 0) return 0;
    return Math.min(1, evidenceCount / totalEpisodes);
  }
}
