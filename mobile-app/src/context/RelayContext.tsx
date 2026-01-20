'use client';

import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Message,
  ConnectionStatus,
  ProjectInfo,
  SessionInfo,
  StatusPayload,
  OutputPayload,
  ErrorPayload
} from '@/lib/types';

interface RelayContextValue {
  status: ConnectionStatus;
  agentConnected: boolean;
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  currentSessionId: string | null;
  terminalOutput: string;
  error: string | null;
  connect: (token: string) => void;
  disconnect: () => void;
  listProjects: () => void;
  listSessions: () => void;
  startSession: (projectId: string) => void;
  sendInput: (input: string) => void;
  closeSession: () => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  clearError: () => void;
  clearTerminal: () => void;
}

const RelayContext = createContext<RelayContextValue | null>(null);

export function RelayProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleMessage = useCallback((message: Message) => {
    switch (message.type) {
      case 'status': {
        const payload = message.payload as StatusPayload;
        switch (payload.status) {
          case 'projects_list': {
            const data = payload.data as { projects: ProjectInfo[] };
            setProjects(data.projects || []);
            break;
          }
          case 'sessions_list': {
            const data = payload.data as { sessions: SessionInfo[] };
            setSessions(data.sessions || []);
            break;
          }
          case 'session_started': {
            const data = payload.data as { sessionId: string; projectId: string };
            setCurrentSessionId(data.sessionId);
            setTerminalOutput('');
            setSessions(prev => [...prev, {
              sessionId: data.sessionId,
              projectId: data.projectId,
              status: 'active',
              lastActivity: Date.now(),
            }]);
            break;
          }
          case 'session_closed': {
            const data = payload.data as { sessionId: string };
            setSessions(prev => prev.filter(s => s.sessionId !== data.sessionId));
            if (currentSessionId === data.sessionId) {
              setCurrentSessionId(null);
            }
            break;
          }
        }
        break;
      }
      case 'output': {
        const payload = message.payload as OutputPayload;
        if (payload.sessionId === currentSessionId) {
          setTerminalOutput(prev => prev + payload.data);
        }
        break;
      }
      case 'error': {
        const payload = message.payload as ErrorPayload;
        setError(`${payload.code}: ${payload.message}`);
        break;
      }
    }
  }, [currentSessionId]);

  const { status, agentConnected, connect, disconnect, sendCommand } = useWebSocket({
    onMessage: handleMessage,
  });

  const listProjects = useCallback(() => {
    sendCommand({ command: 'list_projects' });
  }, [sendCommand]);

  const listSessions = useCallback(() => {
    sendCommand({ command: 'list_sessions' });
  }, [sendCommand]);

  const startSession = useCallback((projectId: string) => {
    sendCommand({ command: 'start_session', projectId });
  }, [sendCommand]);

  const sendInput = useCallback((input: string) => {
    if (!currentSessionId) return;
    sendCommand({ command: 'send_input', sessionId: currentSessionId, input });
  }, [sendCommand, currentSessionId]);

  const closeSession = useCallback(() => {
    if (!currentSessionId) return;
    sendCommand({ command: 'close_session', sessionId: currentSessionId });
    setCurrentSessionId(null);
  }, [sendCommand, currentSessionId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalOutput('');
  }, []);

  // Auto-fetch projects when authenticated and agent connected
  useEffect(() => {
    if (status === 'authenticated' && agentConnected) {
      listProjects();
      listSessions();
    }
  }, [status, agentConnected, listProjects, listSessions]);

  return (
    <RelayContext.Provider value={{
      status,
      agentConnected,
      projects,
      sessions,
      currentSessionId,
      terminalOutput,
      error,
      connect,
      disconnect,
      listProjects,
      listSessions,
      startSession,
      sendInput,
      closeSession,
      setCurrentSessionId,
      clearError,
      clearTerminal,
    }}>
      {children}
    </RelayContext.Provider>
  );
}

export function useRelay() {
  const context = useContext(RelayContext);
  if (!context) {
    throw new Error('useRelay must be used within a RelayProvider');
  }
  return context;
}
