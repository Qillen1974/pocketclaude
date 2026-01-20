'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useRelay } from '@/context/RelayContext';

const TOKEN_KEY = 'relay_token';
const ENV_TOKEN = process.env.NEXT_PUBLIC_RELAY_TOKEN;

export default function AuthPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const { status, connect } = useRelay();
  const router = useRouter();

  useEffect(() => {
    // Priority: 1. Environment token, 2. Saved token in localStorage
    const autoToken = ENV_TOKEN || localStorage.getItem(TOKEN_KEY);
    if (autoToken) {
      setToken(autoToken);
      connect(autoToken);
    }
    setLoading(false);
  }, [connect]);

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/projects');
    }
  }, [status, router]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      localStorage.setItem(TOKEN_KEY, token.trim());
      connect(token.trim());
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Claude Code</h1>
          <p className="text-gray-400">Mobile Access</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6">
          <div className="mb-4">
            <label htmlFor="token" className="block text-sm font-medium text-gray-300 mb-2">
              Access Token
            </label>
            <input
              type="password"
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your relay token"
              className="w-full bg-gray-900 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
            />
          </div>

          {status === 'connecting' && (
            <p className="text-yellow-400 text-sm mb-4">Connecting...</p>
          )}

          {status === 'connected' && (
            <p className="text-yellow-400 text-sm mb-4">Authenticating...</p>
          )}

          <button
            type="submit"
            disabled={!token.trim() || status === 'connecting' || status === 'connected'}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {status === 'connecting' || status === 'connected' ? 'Connecting...' : 'Connect'}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-4">
          Connect to your PC running Claude Code
        </p>
      </div>
    </div>
  );
}
