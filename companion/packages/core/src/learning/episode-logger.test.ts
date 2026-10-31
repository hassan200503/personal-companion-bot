import { describe, expect, it } from 'vitest';
import { DefaultEpisodeLogger } from './episode-logger.js';

describe('EpisodeLogger', () => {
  it('starts and tracks episodes', () => {
    const logger = new DefaultEpisodeLogger();
    const episodeId = logger.startEpisode('conv_123');
    expect(episodeId).toBeTruthy();
    expect(logger.getEpisode(episodeId)).toBeTruthy();
  });

  it('records messages', () => {
    const logger = new DefaultEpisodeLogger();
    const episodeId = logger.startEpisode('conv_123');

    logger.recordMessage(episodeId, {
      id: 'msg_1',
      role: 'user',
      content: 'Open notepad',
      createdAt: new Date().toISOString(),
      status: 'completed',
    });

    const episode = logger.getEpisode(episodeId);
    expect(episode?.messageCount).toBe(1);
  });

  it('records tool uses', () => {
    const logger = new DefaultEpisodeLogger();
    const episodeId = logger.startEpisode('conv_123');

    logger.recordToolUse(episodeId, 'os.open', true, 2);

    const episode = logger.getEpisode(episodeId);
    expect(episode?.toolUses).toHaveLength(1);
    expect(episode?.toolUses[0]?.toolName).toBe('os.open');
  });

  it('ends episode with outcome', () => {
    const logger = new DefaultEpisodeLogger();
    const episodeId = logger.startEpisode('conv_123');

    const episode = logger.endEpisode(episodeId, 'success');
    expect(episode.outcome).toBe('success');
  });

  it('auto-determines outcome based on tool success', () => {
    const logger = new DefaultEpisodeLogger();
    const episodeId = logger.startEpisode('conv_123');

    logger.recordToolUse(episodeId, 'os.open', true, 2);
    logger.recordToolUse(episodeId, 'os.play', false, 2);

    const episode = logger.endEpisode(episodeId);
    expect(episode.outcome).toBe('partial');
  });

  it('extracts topics from messages', () => {
    const logger = new DefaultEpisodeLogger();
    const episodeId = logger.startEpisode('conv_123');

    logger.recordMessage(episodeId, {
      id: 'msg_1',
      role: 'user',
      content: 'Send an email to John',
      createdAt: new Date().toISOString(),
      status: 'completed',
    });

    const episode = logger.getEpisode(episodeId);
    expect(episode?.topics).toContain('email');
  });

  it('generates summary', () => {
    const logger = new DefaultEpisodeLogger();
    const episodeId = logger.startEpisode('conv_123');

    logger.recordMessage(episodeId, {
      id: 'msg_1',
      role: 'user',
      content: 'Open notepad',
      createdAt: new Date().toISOString(),
      status: 'completed',
    });

    logger.recordToolUse(episodeId, 'os.open', true, 2);

    const episode = logger.getEpisode(episodeId);
    const summary = logger.generateSummary(episode!);
    expect(summary).toContain('notepad');
    expect(summary).toContain('os.open');
  });

  it('lists episodes by conversation', () => {
    const logger = new DefaultEpisodeLogger();
    const ep1 = logger.startEpisode('conv_1');
    logger.startEpisode('conv_2');

    const episodes = logger.listEpisodes('conv_1');
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.id).toBe(ep1);
  });

  it('clears all episodes', () => {
    const logger = new DefaultEpisodeLogger();
    logger.startEpisode('conv_1');
    logger.startEpisode('conv_2');

    logger.clear();

    expect(logger.listEpisodes()).toHaveLength(0);
  });
});
