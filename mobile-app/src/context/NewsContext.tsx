'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
  source?: string;
  url?: string;
}

export interface NewsDigest {
  id: string;
  date: string;
  generatedAt: number;
  articles: NewsArticle[];
  rawContent: string;
}

interface NewsContextValue {
  digests: NewsDigest[];
  currentDigest: NewsDigest | null;
  isLoading: boolean;
  addDigest: (content: string) => void;
  getDigestByDate: (date: string) => NewsDigest | undefined;
  deleteDigest: (id: string) => void;
  clearAllDigests: () => void;
}

const NewsContext = createContext<NewsContextValue | null>(null);

const NEWS_STORAGE_KEY = 'pocketclaude_news_digests';
const MAX_DIGESTS = 30; // Keep last 30 days of digests

// Helper to parse news digest from Claude's output
function parseNewsDigest(content: string): Omit<NewsDigest, 'id' | 'generatedAt'> | null {
  // Look for the digest header pattern
  const dateMatch = content.match(/Daily News Digest[^\n]*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i);

  let date = new Date().toISOString().split('T')[0];
  if (dateMatch) {
    try {
      const parsed = new Date(dateMatch[1]);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().split('T')[0];
      }
    } catch {
      // Use today's date
    }
  }

  // Parse articles - look for patterns like **Headline** or ### Headline followed by content
  const articles: NewsArticle[] = [];

  // Pattern 1: **Bold headlines** with content below
  const boldPattern = /\*\*([^*]+)\*\*\s*\n([^*\n][^\n]*(?:\n(?!\*\*)[^\n]+)*)/g;
  let match;

  while ((match = boldPattern.exec(content)) !== null) {
    const title = match[1].trim();
    const rawContent = match[2].trim();
    const summary = rawContent.replace(/\n/g, ' ').slice(0, 300);

    // Skip non-article patterns
    if (title.toLowerCase().includes('summary') ||
        title.toLowerCase().includes('category') ||
        title.length < 5) continue;

    // Try to detect category from context
    let category = 'General';
    const categoryMatch = content.slice(0, match.index).match(/##\s*(Trump|US Politics|Singapore|Gadgets|Tech|World|Business|Science|Politics|Sports|Entertainment|Health)[^\n]*/i);
    if (categoryMatch) {
      const cat = categoryMatch[1];
      // Normalize category names
      if (cat.toLowerCase().includes('trump') || cat.toLowerCase().includes('us politics')) {
        category = 'Trump';
      } else if (cat.toLowerCase().includes('singapore')) {
        category = 'Singapore';
      } else if (cat.toLowerCase().includes('gadget') || cat.toLowerCase().includes('tech')) {
        category = 'Tech';
      } else {
        category = cat;
      }
    }

    // Extract URL - check multiple patterns
    let url: string | undefined;

    // Pattern: Source: https://...
    const sourceMatch = rawContent.match(/Source:\s*(https?:\/\/[^\s\])<]+)/i);
    if (sourceMatch) {
      url = sourceMatch[1];
    }

    // Pattern: [text](https://...)
    if (!url) {
      const markdownLinkMatch = rawContent.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
      if (markdownLinkMatch) {
        url = markdownLinkMatch[2];
      }
    }

    // Pattern: plain URL
    if (!url) {
      const plainUrlMatch = rawContent.match(/https?:\/\/[^\s)\]]+/);
      if (plainUrlMatch) {
        url = plainUrlMatch[0];
      }
    }

    // Clean summary - remove URLs and Source: lines
    const cleanSummary = summary
      .replace(/Source:\s*https?:\/\/[^\s]+/gi, '')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
      .replace(/https?:\/\/[^\s)\]]+/g, '')
      .trim();

    articles.push({
      id: `${date}-${articles.length}`,
      title,
      summary: cleanSummary,
      category,
      url,
    });
  }

  // Pattern 2: Numbered list items (1. **Title** - Summary)
  const numberedPattern = /\d+\.\s*\*?\*?([^*\n-]+)\*?\*?\s*[-–:]\s*([^\n]+)/g;

  while ((match = numberedPattern.exec(content)) !== null) {
    const title = match[1].trim();
    const summary = match[2].trim();

    if (title.length < 5 || articles.some(a => a.title === title)) continue;

    articles.push({
      id: `${date}-${articles.length}`,
      title,
      summary,
      category: 'General',
    });
  }

  if (articles.length === 0) {
    // Fallback: store as single article with raw content
    articles.push({
      id: `${date}-0`,
      title: `News Digest - ${date}`,
      summary: content.slice(0, 500),
      category: 'Digest',
    });
  }

  return {
    date,
    articles,
    rawContent: content,
  };
}

// Load digests from localStorage
function loadDigestsFromStorage(): NewsDigest[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(NEWS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as NewsDigest[];
    }
  } catch (e) {
    console.error('[NewsContext] Failed to load digests from storage:', e);
  }
  return [];
}

// Save digests to localStorage
function saveDigestsToStorage(digests: NewsDigest[]) {
  if (typeof window === 'undefined') return;
  try {
    // Keep only the most recent digests
    const trimmed = digests.slice(0, MAX_DIGESTS);
    localStorage.setItem(NEWS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[NewsContext] Failed to save digests to storage:', e);
  }
}

export function NewsProvider({ children }: { children: React.ReactNode }) {
  const [digests, setDigests] = useState<NewsDigest[]>(() => loadDigestsFromStorage());
  const [isLoading, setIsLoading] = useState(false);

  // Get the most recent digest
  const currentDigest = digests.length > 0 ? digests[0] : null;

  const addDigest = useCallback((content: string) => {
    const parsed = parseNewsDigest(content);
    if (!parsed) return;

    const newDigest: NewsDigest = {
      id: `digest-${Date.now()}`,
      generatedAt: Date.now(),
      ...parsed,
    };

    setDigests(prev => {
      // Remove any existing digest for the same date
      const filtered = prev.filter(d => d.date !== newDigest.date);
      // Add new digest at the beginning
      return [newDigest, ...filtered];
    });
  }, []);

  const getDigestByDate = useCallback((date: string) => {
    return digests.find(d => d.date === date);
  }, [digests]);

  const deleteDigest = useCallback((id: string) => {
    setDigests(prev => prev.filter(d => d.id !== id));
  }, []);

  const clearAllDigests = useCallback(() => {
    setDigests([]);
  }, []);

  // Persist to localStorage whenever digests change
  useEffect(() => {
    saveDigestsToStorage(digests);
  }, [digests]);

  return (
    <NewsContext.Provider value={{
      digests,
      currentDigest,
      isLoading,
      addDigest,
      getDigestByDate,
      deleteDigest,
      clearAllDigests,
    }}>
      {children}
    </NewsContext.Provider>
  );
}

export function useNews() {
  const context = useContext(NewsContext);
  if (!context) {
    throw new Error('useNews must be used within a NewsProvider');
  }
  return context;
}
