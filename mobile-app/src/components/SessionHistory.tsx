'use client';

import { useState } from 'react';
import { SessionHistoryItem } from '@/lib/types';
import { stripAnsi } from '@/lib/ansi';

interface SessionHistoryProps {
  history: SessionHistoryItem[];
  lastSessionOutput: string | null;
  onClose: () => void;
  onViewFullOutput: (projectId: string) => void;
}

export function SessionHistory({ history, lastSessionOutput, onClose, onViewFullOutput }: SessionHistoryProps) {
  const [showFullOutput, setShowFullOutput] = useState(false);

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

  const handleViewLastSession = () => {
    if (history.length > 0) {
      onViewFullOutput(history[0].projectId);
      setShowFullOutput(true);
    }
  };

  // If showing full output, render the output viewer
  if (showFullOutput && lastSessionOutput !== null) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">Last Session Output</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFullOutput(false)}
                className="text-gray-400 hover:text-white text-sm px-3 py-1 bg-gray-700 rounded"
              >
                Back
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-xl px-2"
              >
                &times;
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 bg-gray-950">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
              {stripAnsi(lastSessionOutput)}
            </pre>
          </div>

          <div className="p-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 text-center">
              This is the complete output from your last session
            </p>
          </div>
        </div>
      </div>
    );
  }

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
              {/* Button to view last session's full output */}
              <button
                onClick={handleViewLastSession}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>View Last Session Full Output</span>
              </button>

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
