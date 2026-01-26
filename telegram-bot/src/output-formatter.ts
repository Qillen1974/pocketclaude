// Maximum message length for Telegram
const TELEGRAM_MAX_LENGTH = 4096;
// Buffer timeout before sending batched output
const BUFFER_TIMEOUT_MS = 500;
// Maximum buffer size before force flush
const MAX_BUFFER_SIZE = 8192;

// ANSI escape code regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[PX^_][^\x1b]*\x1b\\|\x1b\[\?[0-9;]*[hl]/g;

// Control characters regex (except newlines and tabs)
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export interface OutputBuffer {
  sessionId: string;
  content: string;
  timer: NodeJS.Timeout | null;
}

export type OutputCallback = (sessionId: string, message: string) => void;

export class OutputFormatter {
  private buffers: Map<string, OutputBuffer> = new Map();
  private outputCallback: OutputCallback;

  constructor(outputCallback: OutputCallback) {
    this.outputCallback = outputCallback;
  }

  /**
   * Clean terminal output for Telegram display
   */
  cleanOutput(text: string): string {
    // Remove ANSI escape codes
    let cleaned = text.replace(ANSI_REGEX, '');

    // Remove control characters except newlines and tabs
    cleaned = cleaned.replace(CONTROL_CHARS_REGEX, '');

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove excessive blank lines (more than 2 consecutive)
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

    // Trim leading/trailing whitespace while preserving internal formatting
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Add output to buffer for the given session
   */
  addOutput(sessionId: string, data: string): void {
    let buffer = this.buffers.get(sessionId);

    if (!buffer) {
      buffer = {
        sessionId,
        content: '',
        timer: null,
      };
      this.buffers.set(sessionId, buffer);
    }

    // Clear existing timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    // Append new content
    buffer.content += data;

    // Force flush if buffer is too large
    if (buffer.content.length >= MAX_BUFFER_SIZE) {
      this.flush(sessionId);
      return;
    }

    // Schedule flush after timeout
    buffer.timer = setTimeout(() => {
      this.flush(sessionId);
    }, BUFFER_TIMEOUT_MS);
  }

  /**
   * Flush buffer for a session
   */
  flush(sessionId: string): void {
    const buffer = this.buffers.get(sessionId);
    if (!buffer || !buffer.content) {
      return;
    }

    // Clear timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    // Clean the output
    const cleaned = this.cleanOutput(buffer.content);

    // Clear buffer
    buffer.content = '';

    if (!cleaned) {
      return;
    }

    // Chunk and send
    const chunks = this.chunkMessage(cleaned);
    for (const chunk of chunks) {
      this.outputCallback(sessionId, chunk);
    }
  }

  /**
   * Flush all buffers
   */
  flushAll(): void {
    for (const sessionId of this.buffers.keys()) {
      this.flush(sessionId);
    }
  }

  /**
   * Clear buffer for a session
   */
  clear(sessionId: string): void {
    const buffer = this.buffers.get(sessionId);
    if (buffer) {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
      this.buffers.delete(sessionId);
    }
  }

  /**
   * Split message into chunks that fit Telegram's limit
   */
  chunkMessage(text: string): string[] {
    if (text.length <= TELEGRAM_MAX_LENGTH) {
      return [this.formatForTelegram(text)];
    }

    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      const lineWithNewline = currentChunk ? '\n' + line : line;

      if (currentChunk.length + lineWithNewline.length > TELEGRAM_MAX_LENGTH - 50) {
        // Reserve space for code block markers if needed
        if (currentChunk) {
          chunks.push(this.formatForTelegram(currentChunk, chunks.length > 0, true));
          currentChunk = line;
        } else {
          // Single line is too long, split it
          const splitLines = this.splitLongLine(line, TELEGRAM_MAX_LENGTH - 50);
          for (let i = 0; i < splitLines.length; i++) {
            chunks.push(this.formatForTelegram(
              splitLines[i],
              chunks.length > 0 || i > 0,
              i < splitLines.length - 1
            ));
          }
        }
      } else {
        currentChunk += lineWithNewline;
      }
    }

    if (currentChunk) {
      chunks.push(this.formatForTelegram(currentChunk, chunks.length > 0, false));
    }

    return chunks;
  }

  /**
   * Split a long line into multiple parts
   */
  private splitLongLine(line: string, maxLength: number): string[] {
    const parts: string[] = [];
    let remaining = line;

    while (remaining.length > maxLength) {
      // Try to split at a space
      let splitIndex = remaining.lastIndexOf(' ', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }
      parts.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trimStart();
    }

    if (remaining) {
      parts.push(remaining);
    }

    return parts;
  }

  /**
   * Format text for Telegram display
   */
  private formatForTelegram(text: string, isContinuation: boolean = false, hasMore: boolean = false): string {
    let formatted = text;

    // Wrap in code block for terminal output
    if (this.looksLikeCode(text)) {
      formatted = '```\n' + formatted + '\n```';
    }

    // Add continuation indicators
    if (isContinuation) {
      formatted = '...\n' + formatted;
    }
    if (hasMore) {
      formatted = formatted + '\n...';
    }

    return formatted;
  }

  /**
   * Check if text looks like code/terminal output
   */
  private looksLikeCode(text: string): boolean {
    const codeIndicators = [
      /^\s{2,}/m,           // Indented lines
      /[{}\[\]();]/,        // Code syntax
      /^(const|let|var|function|class|import|export|def|fn|pub|async)/m,  // Keywords
      /\$ /,                // Shell prompt
      /^>/m,                // REPL prompt
      /error:|warning:/i,   // Compiler output
    ];

    return codeIndicators.some(regex => regex.test(text));
  }

  /**
   * Format a status message
   */
  static formatStatus(status: string, details?: string): string {
    let message = `Status: ${status}`;
    if (details) {
      message += `\n${details}`;
    }
    return message;
  }

  /**
   * Format an error message
   */
  static formatError(code: string, message: string): string {
    return `Error [${code}]: ${message}`;
  }

  /**
   * Format project list
   */
  static formatProjectList(projects: Array<{ id: string; name: string }>): string {
    if (projects.length === 0) {
      return 'No projects configured.';
    }

    const lines = ['Available projects:', ''];
    for (const project of projects) {
      lines.push(`  ${project.id} - ${project.name}`);
    }
    return lines.join('\n');
  }

  /**
   * Format session list
   */
  static formatSessionList(sessions: Array<{ sessionId: string; projectId: string; status: string }>): string {
    if (sessions.length === 0) {
      return 'No active sessions.';
    }

    const lines = ['Active sessions:', ''];
    for (const session of sessions) {
      const statusEmoji = session.status === 'active' ? 'Active' : 'Idle';
      lines.push(`  ${session.sessionId.slice(0, 8)}... (${session.projectId}) [${statusEmoji}]`);
    }
    return lines.join('\n');
  }
}
