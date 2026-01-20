import * as pty from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionInfo, ProjectConfig } from './types';

const BUFFER_MAX_LINES = 100;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const IDLE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export type OutputCallback = (sessionId: string, data: string) => void;
export type SessionClosedCallback = (sessionId: string) => void;

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private onOutput: OutputCallback;
  private onSessionClosed: SessionClosedCallback;
  private idleCheckTimer: NodeJS.Timeout | null = null;

  constructor(onOutput: OutputCallback, onSessionClosed: SessionClosedCallback) {
    this.onOutput = onOutput;
    this.onSessionClosed = onSessionClosed;
    this.startIdleCheck();
  }

  private startIdleCheck(): void {
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleSessions();
    }, IDLE_CHECK_INTERVAL);
  }

  private checkIdleSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > IDLE_TIMEOUT) {
        console.log(`[SessionManager] Session ${sessionId} idle timeout, closing`);
        this.closeSession(sessionId);
      }
    }
  }

  startSession(project: ProjectConfig): string {
    const sessionId = uuidv4();

    // Determine shell based on platform
    // Use cmd.exe on Windows to avoid PowerShell execution policy issues
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';

    console.log(`[SessionManager] Starting session ${sessionId} for project ${project.name} at ${project.path}`);

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: project.path,
      env: process.env as { [key: string]: string },
    });

    const session: Session = {
      pty: ptyProcess,
      projectId: project.id,
      workingDir: project.path,
      status: 'active',
      buffer: [],
      lastActivity: Date.now(),
    };

    ptyProcess.onData((data: string) => {
      console.log(`[SessionManager] PTY output (${data.length} chars): ${data.substring(0, 100).replace(/\r?\n/g, '\\n')}`);
      session.lastActivity = Date.now();
      session.status = 'active';

      // Update circular buffer
      const lines = data.split('\n');
      for (const line of lines) {
        if (line) {
          session.buffer.push(line);
          if (session.buffer.length > BUFFER_MAX_LINES) {
            session.buffer.shift();
          }
        }
      }

      this.onOutput(sessionId, data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[SessionManager] Session ${sessionId} PTY exited with code ${exitCode}`);
      this.sessions.delete(sessionId);
      this.onSessionClosed(sessionId);
    });

    this.sessions.set(sessionId, session);

    // Start claude command after a brief delay
    // Use CLAUDE_PATH env var or default to user's npm global path
    const claudeCmd = process.env.CLAUDE_PATH ||
      (process.platform === 'win32'
        ? '"C:\\Users\\charl\\AppData\\Roaming\\npm\\claude.cmd"'
        : 'claude');

    setTimeout(() => {
      if (this.sessions.has(sessionId)) {
        ptyProcess.write(`${claudeCmd}\r`);
      }
    }, 500);

    return sessionId;
  }

  sendInput(sessionId: string, input: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[SessionManager] Session ${sessionId} not found`);
      return false;
    }

    session.lastActivity = Date.now();
    session.status = 'active';
    // Send input with Enter to submit
    // Claude Code might need Escape first (to ensure we're in command mode) then the text and Enter
    session.pty.write(input + '\r');
    console.log(`[SessionManager] Sent input to session ${sessionId}: ${input.substring(0, 50)}...`);

    // Send an extra Enter after a brief delay to ensure submission
    setTimeout(() => {
      if (this.sessions.has(sessionId)) {
        session.pty.write('\r');
        console.log(`[SessionManager] Sent extra Enter to session ${sessionId}`);
      }
    }, 100);

    return true;
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[SessionManager] Session ${sessionId} not found`);
      return false;
    }

    console.log(`[SessionManager] Closing session ${sessionId}`);
    session.pty.kill();
    this.sessions.delete(sessionId);
    this.onSessionClosed(sessionId);
    return true;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): SessionInfo[] {
    const sessions: SessionInfo[] = [];
    for (const [sessionId, session] of this.sessions) {
      sessions.push({
        sessionId,
        projectId: session.projectId,
        status: session.status,
        lastActivity: session.lastActivity,
      });
    }
    return sessions;
  }

  getSessionBuffer(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.buffer] : [];
  }

  closeAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
  }

  destroy(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    this.closeAllSessions();
  }
}
