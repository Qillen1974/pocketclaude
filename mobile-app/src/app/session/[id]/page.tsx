'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useRelay } from '@/context/RelayContext';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Terminal } from '@/components/Terminal';
import { InputBar } from '@/components/InputBar';
import { QUICK_SESSION_PROJECT_ID } from '@/lib/types';

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const {
    status,
    agentConnected,
    currentSessionId,
    terminalOutput,
    sendInput,
    closeSession,
    setCurrentSessionId,
    sessions,
    projects,
    error,
    clearError,
    uploadFile,
    uploadStatus,
  } = useRelay();

  // Set session ID immediately on mount - this must happen before output arrives
  useEffect(() => {
    if (sessionId) {
      console.log('[SessionPage] Setting currentSessionId to:', sessionId);
      setCurrentSessionId(sessionId);
    }
  }, [sessionId, setCurrentSessionId]);

  useEffect(() => {
    if (status === 'disconnected') {
      router.push('/');
      return;
    }
  }, [status, router]);

  const handleBack = () => {
    router.push('/projects');
  };

  const handleCloseSession = () => {
    closeSession();
    router.push('/projects');
  };

  const session = sessions.find(s => s.sessionId === sessionId);
  const project = session ? projects.find(p => p.id === session.projectId) : null;
  const isQuickSession = session?.projectId === QUICK_SESSION_PROJECT_ID;
  const sessionTitle = isQuickSession ? 'Quick Session' : (project?.name || 'Session');

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col h-screen">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="text-gray-400 hover:text-white"
            >
              &larr;
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white flex items-center gap-2">
                {isQuickSession && <span className="text-purple-400">⚡</span>}
                {sessionTitle}
              </h1>
              {session && (
                <span className={`text-xs ${session.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {session.status}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ConnectionStatus />
            <button
              onClick={handleCloseSession}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900 border-b border-red-700 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-red-200 text-sm">{error}</span>
          <button onClick={clearError} className="text-red-200 hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Terminal */}
      <Terminal output={terminalOutput} />

      {/* Input */}
      <InputBar
        onSubmit={sendInput}
        onUpload={uploadFile}
        uploadStatus={uploadStatus}
        disabled={!agentConnected || !session}
        placeholder={!agentConnected ? 'Agent disconnected' : 'Type a message...'}
      />
    </div>
  );
}
