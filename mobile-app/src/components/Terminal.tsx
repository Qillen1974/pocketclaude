'use client';

import { useEffect, useRef, useMemo } from 'react';
import { ansiToHtml } from '@/lib/ansi';

interface TerminalProps {
  output: string;
}

// Claude Code header pattern - indicates start of a screen frame
const CLAUDE_HEADER = '▐▛███▜▌';

export function Terminal({ output }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  // Only show the last "frame" - find the last occurrence of Claude Code header
  const displayOutput = useMemo(() => {
    const lastHeaderIndex = output.lastIndexOf(CLAUDE_HEADER);
    if (lastHeaderIndex > 0) {
      // Find the start of the line containing the header (look for newline before it)
      let frameStart = lastHeaderIndex;
      while (frameStart > 0 && output[frameStart - 1] !== '\n') {
        frameStart--;
      }
      return output.substring(frameStart);
    }
    return output;
  }, [output]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [displayOutput]);

  const html = ansiToHtml(displayOutput);

  return (
    <div
      ref={terminalRef}
      className="flex-1 bg-terminal-bg p-4 overflow-auto font-mono text-sm leading-relaxed"
    >
      <pre
        className="text-terminal-text whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
