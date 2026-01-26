import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Memory storage location
const MEMORY_DIR = path.join(os.homedir(), '.pocketclaude');
const MEMORY_FILE = path.join(MEMORY_DIR, 'memory.json');

// Maximum number of recent context entries to keep
const MAX_RECENT_CONTEXT = 50;

// Maximum number of recent files per project
const MAX_RECENT_FILES = 20;

// Maximum number of common commands per project
const MAX_COMMON_COMMANDS = 10;

export interface UserPreferences {
  defaultProject?: string;
  preferredEditor?: string;
  timezone?: string;
  [key: string]: string | undefined;
}

export interface ProjectFacts {
  recentFiles: string[];
  commonCommands: string[];
  lastWorkedOn: string;  // ISO date string
  totalSessions: number;
  lastTopic?: string;
}

export interface ContextEntry {
  timestamp: string;  // ISO date string
  project: string;
  summary: string;
  keywords: string[];
}

export interface Memory {
  version: number;
  preferences: UserPreferences;
  projectFacts: { [projectId: string]: ProjectFacts };
  recentContext: ContextEntry[];
}

const DEFAULT_MEMORY: Memory = {
  version: 1,
  preferences: {},
  projectFacts: {},
  recentContext: [],
};

export class MemoryManager {
  private memory: Memory;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private dirty: boolean = false;

  constructor() {
    this.memory = this.load();
  }

  /**
   * Load memory from disk
   */
  load(): Memory {
    try {
      // Ensure directory exists
      if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
      }

      if (fs.existsSync(MEMORY_FILE)) {
        const data = fs.readFileSync(MEMORY_FILE, 'utf-8');
        const parsed = JSON.parse(data) as Memory;

        // Migrate if needed
        return this.migrate(parsed);
      }
    } catch (error) {
      console.error('[MemoryManager] Error loading memory:', error);
    }

    return { ...DEFAULT_MEMORY };
  }

  /**
   * Migrate memory to current version
   */
  private migrate(memory: Memory): Memory {
    // Current version is 1, no migrations needed yet
    if (!memory.version) {
      memory.version = 1;
    }

    // Ensure all required fields exist
    if (!memory.preferences) memory.preferences = {};
    if (!memory.projectFacts) memory.projectFacts = {};
    if (!memory.recentContext) memory.recentContext = [];

    return memory;
  }

  /**
   * Save memory to disk (debounced)
   */
  save(): void {
    this.dirty = true;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.saveImmediate();
    }, 1000);
  }

  /**
   * Save memory immediately
   */
  saveImmediate(): void {
    if (!this.dirty) return;

    try {
      if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
      }

      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memory, null, 2));
      this.dirty = false;
      console.log('[MemoryManager] Memory saved');
    } catch (error) {
      console.error('[MemoryManager] Error saving memory:', error);
    }
  }

  /**
   * Record activity for a project
   */
  recordActivity(projectId: string, activity: string): void {
    const facts = this.getProjectFacts(projectId);

    facts.lastWorkedOn = new Date().toISOString();
    facts.totalSessions = (facts.totalSessions || 0) + 1;

    // Extract keywords from activity
    const keywords = this.extractKeywords(activity);

    // Add context entry
    this.addContextEntry({
      timestamp: new Date().toISOString(),
      project: projectId,
      summary: activity.slice(0, 200),  // Truncate long summaries
      keywords,
    });

    this.save();
  }

  /**
   * Record a file that was worked on
   */
  recordFile(projectId: string, filePath: string): void {
    const facts = this.getProjectFacts(projectId);

    // Remove if already exists (to move to front)
    const index = facts.recentFiles.indexOf(filePath);
    if (index > -1) {
      facts.recentFiles.splice(index, 1);
    }

    // Add to front
    facts.recentFiles.unshift(filePath);

    // Trim to max
    if (facts.recentFiles.length > MAX_RECENT_FILES) {
      facts.recentFiles = facts.recentFiles.slice(0, MAX_RECENT_FILES);
    }

    this.save();
  }

  /**
   * Record a command that was used
   */
  recordCommand(projectId: string, command: string): void {
    const facts = this.getProjectFacts(projectId);

    // Simple frequency tracking - increment count or add new
    const existingIndex = facts.commonCommands.indexOf(command);
    if (existingIndex > -1) {
      // Move to front (most recent)
      facts.commonCommands.splice(existingIndex, 1);
      facts.commonCommands.unshift(command);
    } else {
      facts.commonCommands.unshift(command);
    }

    // Trim to max
    if (facts.commonCommands.length > MAX_COMMON_COMMANDS) {
      facts.commonCommands = facts.commonCommands.slice(0, MAX_COMMON_COMMANDS);
    }

    this.save();
  }

  /**
   * Record the topic being worked on
   */
  recordTopic(projectId: string, topic: string): void {
    const facts = this.getProjectFacts(projectId);
    facts.lastTopic = topic;
    this.save();
  }

  /**
   * Get project facts, creating if needed
   */
  private getProjectFacts(projectId: string): ProjectFacts {
    if (!this.memory.projectFacts[projectId]) {
      this.memory.projectFacts[projectId] = {
        recentFiles: [],
        commonCommands: [],
        lastWorkedOn: new Date().toISOString(),
        totalSessions: 0,
      };
    }
    return this.memory.projectFacts[projectId];
  }

  /**
   * Add a context entry
   */
  private addContextEntry(entry: ContextEntry): void {
    this.memory.recentContext.unshift(entry);

    // Trim to max
    if (this.memory.recentContext.length > MAX_RECENT_CONTEXT) {
      this.memory.recentContext = this.memory.recentContext.slice(0, MAX_RECENT_CONTEXT);
    }
  }

  /**
   * Get relevant context for a query
   */
  getRelevantContext(query: string, limit: number = 5): ContextEntry[] {
    const queryKeywords = this.extractKeywords(query);

    // Score each context entry by keyword overlap
    const scored = this.memory.recentContext.map(entry => {
      let score = 0;
      for (const keyword of queryKeywords) {
        if (entry.keywords.includes(keyword)) {
          score += 1;
        }
        if (entry.summary.toLowerCase().includes(keyword)) {
          score += 0.5;
        }
        if (entry.project.toLowerCase().includes(keyword)) {
          score += 0.3;
        }
      }
      return { entry, score };
    });

    // Sort by score and return top entries
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.entry);
  }

  /**
   * Get recent context for a project
   */
  getProjectContext(projectId: string, limit: number = 5): ContextEntry[] {
    return this.memory.recentContext
      .filter(entry => entry.project === projectId)
      .slice(0, limit);
  }

  /**
   * Get all facts for a project
   */
  getProjectFactsReadonly(projectId: string): ProjectFacts | undefined {
    return this.memory.projectFacts[projectId];
  }

  /**
   * Set a preference
   */
  setPreference(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete this.memory.preferences[key];
    } else {
      this.memory.preferences[key] = value;
    }
    this.save();
  }

  /**
   * Get a preference
   */
  getPreference(key: string): string | undefined {
    return this.memory.preferences[key];
  }

  /**
   * Get all preferences
   */
  getPreferences(): UserPreferences {
    return { ...this.memory.preferences };
  }

  /**
   * Get summary of what was recently worked on
   */
  getRecentWorkSummary(): string {
    const recentProjects: Map<string, { lastWorked: Date; topic?: string }> = new Map();

    // Get most recent work per project
    for (const entry of this.memory.recentContext) {
      if (!recentProjects.has(entry.project)) {
        recentProjects.set(entry.project, {
          lastWorked: new Date(entry.timestamp),
        });
      }
    }

    // Add topic info from facts
    for (const [projectId, facts] of Object.entries(this.memory.projectFacts)) {
      const existing = recentProjects.get(projectId);
      if (existing && facts.lastTopic) {
        existing.topic = facts.lastTopic;
      }
    }

    // Build summary
    const lines: string[] = ['Recent work:'];
    const sortedProjects = Array.from(recentProjects.entries())
      .sort((a, b) => b[1].lastWorked.getTime() - a[1].lastWorked.getTime())
      .slice(0, 5);

    for (const [projectId, info] of sortedProjects) {
      const ago = this.formatTimeAgo(info.lastWorked);
      const topicPart = info.topic ? ` - ${info.topic}` : '';
      lines.push(`  ${projectId}: ${ago}${topicPart}`);
    }

    return lines.join('\n');
  }

  /**
   * Format a date as "X ago"
   */
  private formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
      'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
      'his', 'our', 'their', 'what', 'which', 'who', 'when', 'where', 'why',
      'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too',
      'very', 'just', 'also', 'now', 'here', 'there', 'then', 'if', 'else',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.memory = { ...DEFAULT_MEMORY };
    this.saveImmediate();
  }

  /**
   * Export memory as JSON
   */
  export(): string {
    return JSON.stringify(this.memory, null, 2);
  }

  /**
   * Import memory from JSON
   */
  import(json: string): void {
    try {
      const parsed = JSON.parse(json) as Memory;
      this.memory = this.migrate(parsed);
      this.saveImmediate();
    } catch (error) {
      console.error('[MemoryManager] Error importing memory:', error);
      throw new Error('Invalid memory format');
    }
  }
}
