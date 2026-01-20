import * as fs from 'fs';
import * as path from 'path';

const HISTORY_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.pocketclaude', 'history');

export interface SessionRecord {
  sessionId: string;
  projectId: string;
  projectName: string;
  startTime: number;
  endTime?: number;
  outputFile: string;
  summaryFile: string;
}

export interface SessionSummary {
  sessionId: string;
  projectId: string;
  projectName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  preview: string; // First/last few lines
}

export class HistoryManager {
  private sessions: Map<string, SessionRecord> = new Map();

  constructor() {
    this.ensureHistoryDir();
  }

  private ensureHistoryDir(): void {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
  }

  private getProjectDir(projectId: string): string {
    const dir = path.join(HISTORY_DIR, projectId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  startSession(sessionId: string, projectId: string, projectName: string): void {
    const projectDir = this.getProjectDir(projectId);
    const timestamp = Date.now();
    const outputFile = path.join(projectDir, `${timestamp}-${sessionId}.log`);
    const summaryFile = path.join(projectDir, `${timestamp}-${sessionId}.summary.json`);

    const record: SessionRecord = {
      sessionId,
      projectId,
      projectName,
      startTime: timestamp,
      outputFile,
      summaryFile,
    };

    this.sessions.set(sessionId, record);

    // Write initial summary
    this.writeSummary(record);

    // Create empty output file
    fs.writeFileSync(outputFile, '');

    console.log(`[HistoryManager] Started recording session ${sessionId}`);
  }

  appendOutput(sessionId: string, data: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    try {
      fs.appendFileSync(record.outputFile, data);
    } catch (err) {
      console.error(`[HistoryManager] Failed to append output:`, err);
    }
  }

  endSession(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    record.endTime = Date.now();
    this.writeSummary(record);
    this.sessions.delete(sessionId);

    console.log(`[HistoryManager] Ended recording session ${sessionId}`);
  }

  private writeSummary(record: SessionRecord): void {
    try {
      let preview = '';
      if (fs.existsSync(record.outputFile)) {
        const content = fs.readFileSync(record.outputFile, 'utf-8');
        // Get last 500 chars as preview
        preview = content.slice(-500);
      }

      const summary: SessionSummary = {
        sessionId: record.sessionId,
        projectId: record.projectId,
        projectName: record.projectName,
        startTime: record.startTime,
        endTime: record.endTime,
        duration: record.endTime ? record.endTime - record.startTime : undefined,
        preview,
      };

      fs.writeFileSync(record.summaryFile, JSON.stringify(summary, null, 2));
    } catch (err) {
      console.error(`[HistoryManager] Failed to write summary:`, err);
    }
  }

  getSessionHistory(projectId: string, limit: number = 10): SessionSummary[] {
    const projectDir = path.join(HISTORY_DIR, projectId);
    if (!fs.existsSync(projectDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.summary.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const summaries: SessionSummary[] = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(projectDir, file), 'utf-8');
          summaries.push(JSON.parse(content));
        } catch (err) {
          // Skip invalid files
        }
      }

      return summaries;
    } catch (err) {
      console.error(`[HistoryManager] Failed to get history:`, err);
      return [];
    }
  }

  getLastSessionOutput(projectId: string): string | null {
    const projectDir = path.join(HISTORY_DIR, projectId);
    if (!fs.existsSync(projectDir)) {
      return null;
    }

    try {
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse();

      if (files.length === 0) return null;

      const lastFile = path.join(projectDir, files[0]);
      return fs.readFileSync(lastFile, 'utf-8');
    } catch (err) {
      console.error(`[HistoryManager] Failed to get last session:`, err);
      return null;
    }
  }

  getContextSummary(projectId: string): string {
    const history = this.getSessionHistory(projectId, 3);
    if (history.length === 0) {
      return '';
    }

    let summary = '=== Previous Session Context ===\n';
    for (const session of history.reverse()) {
      const date = new Date(session.startTime).toLocaleString();
      summary += `\n--- Session from ${date} ---\n`;
      if (session.preview) {
        summary += session.preview + '\n';
      }
    }
    summary += '=== End of Previous Context ===\n\n';

    return summary;
  }
}
