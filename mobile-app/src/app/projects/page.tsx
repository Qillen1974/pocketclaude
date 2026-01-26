'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRelay } from '@/context/RelayContext';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { ProjectCard } from '@/components/ProjectCard';
import { SessionHistory } from '@/components/SessionHistory';

export default function ProjectsPage() {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  const [smartInput, setSmartInput] = useState('');
  const [isSmartRouting, setIsSmartRouting] = useState(false);
  const {
    status,
    agentConnected,
    projects,
    sessions,
    sessionHistory,
    lastSessionOutput,
    startSession,
    startQuickSession,
    smartCommand,
    setCurrentSessionId,
    disconnect,
    error,
    clearError,
    getSessionHistory,
    getLastSessionOutput,
    clearLastSessionOutput,
  } = useRelay();

  useEffect(() => {
    if (status === 'disconnected') {
      router.push('/');
    }
  }, [status, router]);

  const handleSelectProject = (projectId: string) => {
    startSession(projectId);
  };

  const handleQuickSession = () => {
    startQuickSession();
  };

  const handleSmartCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartInput.trim() || isSmartRouting) return;
    setIsSmartRouting(true);
    smartCommand(smartInput.trim());
    setSmartInput('');
    // Reset routing state after a delay (session navigation will happen automatically)
    setTimeout(() => setIsSmartRouting(false), 3000);
  };

  const handleOpenSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    router.push(`/session/${sessionId}`);
  };

  const handleDisconnect = () => {
    localStorage.removeItem('relay_token');
    disconnect();
    router.push('/');
  };

  const handleViewHistory = (projectId: string) => {
    getSessionHistory(projectId);
    setShowHistory(true);
  };

  // Navigate to session page when a session is started
  useEffect(() => {
    const latestSession = sessions[sessions.length - 1];
    if (latestSession) {
      const sessionAge = Date.now() - latestSession.lastActivity;
      if (sessionAge < 5000) {
        router.push(`/session/${latestSession.sessionId}`);
      }
    }
  }, [sessions, router]);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Projects</h1>
          <div className="flex items-center gap-3">
            <ConnectionStatus />
            <button
              onClick={handleDisconnect}
              className="text-gray-400 hover:text-white text-sm"
            >
              Disconnect
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900 border-b border-red-700 px-4 py-2 flex items-center justify-between">
          <span className="text-red-200 text-sm">{error}</span>
          <button onClick={clearError} className="text-red-200 hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 p-4 overflow-auto">
        {!agentConnected ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-yellow-400 mb-2">Waiting for PC Agent</div>
            <p className="text-gray-400 text-sm">
              Make sure the PC agent is running and connected
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Smart Chat Input */}
            <div className="bg-gray-800 rounded-lg p-4 border border-blue-600/50">
              <h3 className="text-white font-medium flex items-center gap-2 mb-3">
                <span className="text-blue-400">🧠</span>
                Smart Chat
              </h3>
              <p className="text-gray-400 text-sm mb-3">
                Just type - auto-routes to the right project based on keywords
              </p>
              <form onSubmit={handleSmartCommand} className="flex gap-2">
                <input
                  type="text"
                  value={smartInput}
                  onChange={(e) => setSmartInput(e.target.value)}
                  placeholder="e.g., 'check the relay server code' or 'fix task manager bug'"
                  className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={isSmartRouting}
                />
                <button
                  type="submit"
                  disabled={!smartInput.trim() || isSmartRouting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {isSmartRouting ? 'Routing...' : 'Send'}
                </button>
              </form>
            </div>

            {/* Quick Session Card */}
            <div className="bg-gray-800 rounded-lg p-4 border border-purple-600/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium flex items-center gap-2">
                    <span className="text-purple-400">⚡</span>
                    Quick Session
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Start Claude without selecting a project
                  </p>
                </div>
                <button
                  onClick={handleQuickSession}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                >
                  Start
                </button>
              </div>
            </div>

            {/* Projects */}
            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <div className="text-gray-400 mb-2">No Projects</div>
                <p className="text-gray-500 text-sm">
                  Configure projects in your PC agent&apos;s projects.json
                </p>
              </div>
            ) : (
              projects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  sessions={sessions}
                  onSelect={handleSelectProject}
                  onOpenSession={handleOpenSession}
                  onViewHistory={handleViewHistory}
                />
              ))
            )}
          </div>
        )}
      </main>

      {/* Session History Modal */}
      {showHistory && (
        <SessionHistory
          history={sessionHistory}
          lastSessionOutput={lastSessionOutput}
          onClose={() => {
            setShowHistory(false);
            clearLastSessionOutput();
          }}
          onViewFullOutput={getLastSessionOutput}
        />
      )}
    </div>
  );
}
