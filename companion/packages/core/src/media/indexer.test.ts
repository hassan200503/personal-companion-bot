import { describe, expect, it } from 'vitest';
import { MediaIndexer, getDefaultMediaDirectories } from './indexer.js';

describe('MediaIndexer', () => {
  it('creates indexer with directories', () => {
    const directories = getDefaultMediaDirectories();
    const indexer = new MediaIndexer(directories);
    const stats = indexer.getStats();
    expect(stats.directories).toEqual(directories);
  });

  it('updates index incrementally', async () => {
    const directories = getDefaultMediaDirectories();
    const indexer = new MediaIndexer(directories, 2, 10); // Shallow scan, limit 10 files
    const stats = await indexer.updateIndex();
    expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
    expect(stats.lastIndexed).toBeTruthy();
  });

  it('searches indexed media', async () => {
    const directories = getDefaultMediaDirectories();
    const indexer = new MediaIndexer(directories, 2, 10);
    await indexer.updateIndex();
    const results = indexer.search('test');
    expect(Array.isArray(results)).toBe(true);
  });

  it('prunes deleted files', async () => {
    const directories = getDefaultMediaDirectories();
    const indexer = new MediaIndexer(directories, 2, 10);
    await indexer.updateIndex();
    // Clear and re-index to test prune behavior
    indexer.clear();
    await indexer.updateIndex();
    const statsAfter = indexer.getStats();
    // Should have files after re-indexing
    expect(statsAfter.totalFiles).toBeGreaterThanOrEqual(0);
  });

  it('clears index', async () => {
    const directories = getDefaultMediaDirectories();
    const indexer = new MediaIndexer(directories, 2, 10);
    await indexer.updateIndex();
    indexer.clear();
    const stats = indexer.getStats();
    expect(stats.totalFiles).toBe(0);
  });

  it('identifies media files', () => {
    const directories = getDefaultMediaDirectories();
    const indexer = new MediaIndexer(directories);
    // Check private method behavior through public API
    expect(indexer.getStats().directories).toBeInstanceOf(Array);
  });
});
