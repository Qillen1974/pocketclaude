'use client';

import { ProjectInfo, SessionInfo } from '@/lib/types';

interface ProjectCardProps {
  project: ProjectInfo;
  sessions: SessionInfo[];
  onSelect: (projectId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onViewHistory: (projectId: string) => void;
}

export function ProjectCard({ project, sessions, onSelect, onOpenSession, onViewHistory }: ProjectCardProps) {
  const projectSessions = sessions.filter(s => s.projectId === project.id);
  const hasActiveSession = projectSessions.length > 0;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-medium text-white">{project.name}</h3>
          <p className="text-sm text-gray-400 mt-1 break-all">{project.path}</p>
        </div>
        {hasActiveSession && (
          <span className="ml-2 px-2 py-1 text-xs rounded-full bg-green-900 text-green-300">
            Active
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!hasActiveSession ? (
          <button
            onClick={() => onSelect(project.id)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Start Session
          </button>
        ) : (
          projectSessions.map(session => (
            <button
              key={session.sessionId}
              onClick={() => onOpenSession(session.sessionId)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Open Session
            </button>
          ))
        )}
        <button
          onClick={() => onViewHistory(project.id)}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          History
        </button>
      </div>
    </div>
  );
}
