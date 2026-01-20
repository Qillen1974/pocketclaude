'use client';

import { useRelay } from '@/context/RelayContext';

export function ConnectionStatus() {
  const { status, agentConnected } = useRelay();

  const getStatusColor = () => {
    if (status === 'authenticated' && agentConnected) return 'bg-green-500';
    if (status === 'authenticated') return 'bg-yellow-500';
    if (status === 'connected' || status === 'connecting') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (status === 'authenticated' && agentConnected) return 'Connected';
    if (status === 'authenticated') return 'Waiting for Agent';
    if (status === 'connected') return 'Authenticating...';
    if (status === 'connecting') return 'Connecting...';
    return 'Disconnected';
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span className="text-sm text-gray-300">{getStatusText()}</span>
    </div>
  );
}
