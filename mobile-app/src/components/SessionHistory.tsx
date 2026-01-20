'use client';

import { SessionHistoryItem } from '@/lib/types';

interface SessionHistoryProps {
  history: SessionHistoryItem[];
  onClose: () => void;
}

export function SessionHistory({ history, onClose }: SessionHistoryProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'In progress';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'Less than a minute';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes % 60} min`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Session History</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {history.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No previous sessions</p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.sessionId}
                  className="bg-gray-900 rounded-lg p-3 border border-gray-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">
                      {formatDate(item.startTime)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDuration(item.duration)}
                    </span>
                  </div>
                  {item.preview && (
                    <pre className="text-xs text-gray-300 bg-gray-950 p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {item.preview.slice(-200)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">
            Session history is saved locally on your PC
          </p>
        </div>
      </div>
    </div>
  );
}
