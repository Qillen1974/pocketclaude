'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRelay } from '@/context/RelayContext';
import { useNews, NewsDigest, NewsArticle } from '@/context/NewsContext';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { BottomNav } from '@/components/BottomNav';

// Helper to convert URLs in text to clickable links
function linkifyText(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function ArticleCard({ article }: { article: NewsArticle }) {
  const categoryColors: Record<string, string> = {
    Trump: 'bg-red-600',
    Singapore: 'bg-rose-500',
    Tech: 'bg-purple-600',
    Gadgets: 'bg-purple-600',
    World: 'bg-blue-600',
    Business: 'bg-green-600',
    Science: 'bg-cyan-600',
    Politics: 'bg-red-600',
    Sports: 'bg-orange-600',
    Entertainment: 'bg-pink-600',
    Health: 'bg-teal-600',
    General: 'bg-gray-600',
    Digest: 'bg-gray-600',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-white font-medium flex-1">{article.title}</h3>
        <span className={`text-xs px-2 py-1 rounded ${categoryColors[article.category] || categoryColors.General} text-white whitespace-nowrap`}>
          {article.category}
        </span>
      </div>
      <p className="text-gray-400 text-sm leading-relaxed">{linkifyText(article.summary)}</p>
      {article.url && (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 text-sm mt-2 inline-block hover:underline"
        >
          Read more →
        </a>
      )}
    </div>
  );
}

function DigestCard({ digest, onSelect, isSelected }: {
  digest: NewsDigest;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const formattedDate = new Date(digest.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        isSelected
          ? 'bg-blue-600 text-white'
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
      }`}
    >
      <div className="font-medium">{formattedDate}</div>
      <div className={`text-sm ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
        {digest.articles.length} articles
      </div>
    </button>
  );
}

export default function NewsPage() {
  const router = useRouter();
  const { status, agentConnected, disconnect, setNewsCallback } = useRelay();
  const { digests, currentDigest, addDigest, clearAllDigests } = useNews();
  const [selectedDigest, setSelectedDigest] = useState<NewsDigest | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isRequestingNews, setIsRequestingNews] = useState(false);

  // Register callback to receive news digests from Claude
  const handleNewsDigest = useCallback((content: string) => {
    console.log('[NewsPage] Received news digest:', content.slice(0, 100));
    addDigest(content);
  }, [addDigest]);

  useEffect(() => {
    setNewsCallback(handleNewsDigest);
    return () => setNewsCallback(null);
  }, [setNewsCallback, handleNewsDigest]);

  // Select current digest by default
  useEffect(() => {
    if (!selectedDigest && currentDigest) {
      setSelectedDigest(currentDigest);
    }
  }, [selectedDigest, currentDigest]);

  useEffect(() => {
    if (status === 'disconnected') {
      router.push('/');
    }
  }, [status, router]);

  const handleRequestNews = async () => {
    // Trigger webhook to TaskWatcher which sends Telegram notification for approval
    setIsRequestingNews(true);
    try {
      // Try local webhook first, then tunnel
      const webhookUrls = [
        'http://localhost:3002/webhook/task',
        'https://possess-demo-plenty-buck.trycloudflare.com/webhook/task'
      ];

      const payload = {
        taskId: `news-${Date.now()}`,
        title: 'Daily News Digest',
        description: 'Search for today\'s news on Trump, Singapore, and Gadgets. Compile a digest with headlines, summaries, and source URLs.',
        projectName: 'daily-newsroom',
        priority: 'high'
      };

      let success = false;
      for (const url of webhookUrls) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (response.ok) {
            success = true;
            break;
          }
        } catch {
          // Try next URL
        }
      }

      if (!success) {
        console.error('Failed to send news request webhook');
      }
    } catch (error) {
      console.error('Error requesting news:', error);
    } finally {
      setIsRequestingNews(false);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('relay_token');
    disconnect();
    router.push('/');
  };

  const displayDigest = selectedDigest || currentDigest;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col pb-16">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">News</h1>
          <div className="flex items-center gap-3">
            <ConnectionStatus />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Settings dropdown */}
        {showSettings && (
          <div className="absolute right-4 top-14 bg-gray-700 rounded-lg shadow-lg py-2 min-w-[150px] z-20">
            <button
              onClick={() => {
                clearAllDigests();
                setShowSettings(false);
              }}
              className="w-full text-left px-4 py-2 text-red-400 hover:bg-gray-600 text-sm"
            >
              Clear All News
            </button>
            <button
              onClick={() => {
                handleDisconnect();
                setShowSettings(false);
              }}
              className="w-full text-left px-4 py-2 text-gray-300 hover:bg-gray-600 text-sm"
            >
              Disconnect
            </button>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {!agentConnected ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-4">
            <div className="text-yellow-400 mb-2">Waiting for PC Agent</div>
            <p className="text-gray-400 text-sm">
              Make sure the PC agent is running and connected
            </p>
          </div>
        ) : digests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-4">
            <div className="text-6xl mb-4">📰</div>
            <h2 className="text-white text-lg font-medium mb-2">No News Yet</h2>
            <p className="text-gray-400 text-sm mb-4">
              Your daily news digests from Claude will appear here
            </p>
            <button
              onClick={handleRequestNews}
              disabled={isRequestingNews}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {isRequestingNews ? 'Requesting...' : 'Request Today\'s News'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row">
            {/* Digest selector (horizontal scroll on mobile, sidebar on desktop) */}
            <div className="lg:w-48 lg:border-r lg:border-gray-700 p-4 lg:p-0 lg:py-4">
              <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 lg:px-4">
                {digests.map((digest) => (
                  <DigestCard
                    key={digest.id}
                    digest={digest}
                    isSelected={selectedDigest?.id === digest.id}
                    onSelect={() => setSelectedDigest(digest)}
                  />
                ))}
              </div>
            </div>

            {/* Articles */}
            <div className="flex-1 p-4 space-y-4">
              {displayDigest && (
                <>
                  {/* Digest header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-white font-medium">
                        {new Date(displayDigest.date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </h2>
                      <p className="text-gray-500 text-sm">
                        {displayDigest.articles.length} articles
                      </p>
                    </div>
                    <button
                      onClick={() => setShowRaw(!showRaw)}
                      className="text-sm text-gray-400 hover:text-white"
                    >
                      {showRaw ? 'Show Cards' : 'Show Raw'}
                    </button>
                  </div>

                  {/* Articles or raw content */}
                  {showRaw ? (
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
                        {displayDigest.rawContent}
                      </pre>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {displayDigest.articles.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating action button to request news */}
      {agentConnected && digests.length > 0 && (
        <button
          onClick={handleRequestNews}
          className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-10"
          title="Request new digest"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}

      <BottomNav />
    </div>
  );
}
