export type MessageType = 'auth' | 'command' | 'output' | 'status' | 'error';
export type ConnectionRole = 'agent' | 'client';

// Quick session constant - used when starting without a project
export const QUICK_SESSION_PROJECT_ID = '__quick__';

export interface Message {
  type: MessageType;
  sessionId?: string;
  payload: unknown;
  timestamp: number;
}

export interface AuthPayload {
  token: string;
  role: ConnectionRole;
}

export interface CommandPayload {
  command: 'list_projects' | 'list_sessions' | 'start_session' | 'send_input' | 'close_session' | 'get_session_history' | 'get_context_summary' | 'get_last_session_output' | 'keepalive' | 'upload_file' | 'list_custom_commands' | 'smart_command';
  projectId?: string;
  input?: string;
  sessionId?: string;
  // File upload fields
  fileName?: string;
  fileContent?: string;  // Base64 encoded
  mimeType?: string;
}

export interface CustomCommand {
  name: string;
  description: string;
  content: string;
}

export interface OutputPayload {
  data: string;
  sessionId: string;
}

export interface StatusPayload {
  status: 'connected' | 'disconnected' | 'session_started' | 'session_closed' | 'projects_list' | 'sessions_list' | 'session_history' | 'last_session_output' | 'file_uploaded' | 'custom_commands_list';
  data?: unknown;
  sessionId?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
}

export interface SessionInfo {
  sessionId: string;
  projectId: string;
  status: 'active' | 'idle';
  lastActivity: number;
  isQuickSession?: boolean;
}

export interface SessionHistoryItem {
  sessionId: string;
  projectId: string;
  projectName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  preview: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticated';
