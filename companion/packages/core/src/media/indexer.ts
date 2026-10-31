/**
 * Media Indexer
 *
 * Incremental media file indexing with persistence.
 * Scans directories for media files and maintains a persistent index
 * for fast lookup without full directory walks.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MediaEntry } from './resolver.js';

export interface IndexedMedia extends MediaEntry {
  indexedAt: string;
  fileSize: number;
  lastModified: number;
}

export interface IndexStats {
  totalFiles: number;
  lastIndexed: string;
  directories: string[];
}

export class MediaIndexer {
  private index = new Map<string, IndexedMedia>();
  private lastIndexed: number = 0;
  private readonly directories: string[];
  private readonly maxDepth: number;
  private readonly maxFiles: number;

  constructor(
    directories: string[],
    maxDepth = 3,
    maxFiles = 500
  ) {
    this.directories = directories.filter(existsSync);
    this.maxDepth = maxDepth;
    this.maxFiles = maxFiles;
  }

  /**
   * Perform incremental index update
   * Only scans new/changed files since last index
   */
  async updateIndex(): Promise<IndexStats> {
    const now = Date.now();
    let totalFiles = 0;

    for (const root of this.directories) {
      totalFiles = await this.walkDirectory(root, this.maxDepth, now, totalFiles);
    }

    // Remove files that no longer exist
    this.pruneDeletedFiles(now);

    this.lastIndexed = now;

    return {
      totalFiles: this.index.size,
      lastIndexed: new Date(this.lastIndexed).toISOString(),
      directories: this.directories,
    };
  }

  /**
   * Walk directory recursively and index media files
   */
  private async walkDirectory(
    dir: string,
    depth: number,
    now: number,
    fileCount: number
  ): Promise<number> {
    if (depth < 0 || fileCount >= this.maxFiles) return fileCount;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isFile() && this.isMediaFile(entry.name)) {
          try {
            const stats = statSync(fullPath);
            const existing = this.index.get(fullPath);

            // Skip if file hasn't changed
            if (existing && existing.lastModified === stats.mtimeMs) {
              continue;
            }

            // Index the file
            this.index.set(fullPath, {
              path: fullPath,
              title: entry.name.replace(/\.[^.]+$/, ''),
              indexedAt: new Date(now).toISOString(),
              fileSize: stats.size,
              lastModified: stats.mtimeMs,
            });

            fileCount++;
          } catch {
            // Skip files that can't be accessed
          }
        } else if (entry.isDirectory()) {
          fileCount = await this.walkDirectory(fullPath, depth - 1, now, fileCount);
        }
      }
    } catch {
      // Skip directories that can't be accessed
    }
    return fileCount;
  }

  /**
   * Remove files that no longer exist
   */
  private pruneDeletedFiles(now: number): void {
    console.log(`Pruning files as of ${new Date(now).toISOString()}`);
    for (const [path] of this.index.entries()) {
      if (!existsSync(path)) {
        this.index.delete(path);
      }
    }
  }

  /**
   * Check if file is a media file
   */
  private isMediaFile(filename: string): boolean {
    return /\.(mp3|wav|m4a|flac|mp4|mkv|avi|mov|wma|ogg)$/i.test(filename);
  }

  /**
   * Get all indexed media entries
   */
  getEntries(): MediaEntry[] {
    return Array.from(this.index.values()).map(({ path, title, artist, album }) => ({
      path,
      title,
      artist,
      album,
    }));
  }

  /**
   * Search indexed media by query
   */
  search(query: string): MediaEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.getEntries().filter(entry =>
      entry.title.toLowerCase().includes(lowerQuery) ||
      (entry.artist && entry.artist.toLowerCase().includes(lowerQuery)) ||
      (entry.album && entry.album.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats {
    return {
      totalFiles: this.index.size,
      lastIndexed: new Date(this.lastIndexed).toISOString(),
      directories: this.directories,
    };
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.index.clear();
    this.lastIndexed = 0;
  }

  /**
   * Load index from persisted data (future enhancement)
   */
  async loadFromPersistence(): Promise<void> {
    // TODO: Implement database persistence
    // For now, start fresh
  }

  /**
   * Save index to persisted data (future enhancement)
   */
  async saveToPersistence(): Promise<void> {
    // TODO: Implement database persistence
    // For now, index is in-memory only
  }
}

/**
 * Get default media directories for Windows
 */
export function getDefaultMediaDirectories(): string[] {
  const userProfile = process.env.USERPROFILE;
  if (!userProfile) return [];

  return [
    join(userProfile, 'Music'),
    join(userProfile, 'Videos'),
    join(userProfile, 'Downloads'),
    join(userProfile, 'Desktop'),
    join(userProfile, 'Documents'),
  ].filter(existsSync);
}
