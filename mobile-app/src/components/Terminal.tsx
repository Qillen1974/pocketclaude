'use client';

import { useEffect, useRef, useMemo } from 'react';
import { ansiToHtml, stripAnsi } from '@/lib/ansi';

interface TerminalProps {
  output: string;
}

// Claude Code header pattern - indicates start of a screen frame
const CLAUDE_HEADER = '▐▛███▜▌';

// Remove duplicate lines/blocks from terminal output (compares stripped content)
function deduplicateLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const strippedLine = stripAnsi(line);
    result.push(line);

    // Look for repeated identical lines (by stripped content) and skip duplicates
    let j = i + 1;
    while (j < lines.length && stripAnsi(lines[j]) === strippedLine && strippedLine.trim().length > 0) {
      j++;
    }
    i = j > i + 1 ? j : i + 1;
  }

  return result.join('\n');
}

export function Terminal({ output }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  // Only show the last "frame" - find the last occurrence of Claude Code header
  const displayOutput = useMemo(() => {
    // Strip ANSI codes to find patterns (raw output has codes between chars)
    const stripped = stripAnsi(output);

    // Find the Claude Code header
    const lastHeaderIndex = stripped.lastIndexOf(CLAUDE_HEADER);

    let frameOutput = output;

    if (lastHeaderIndex > 0) {
      // Find corresponding position in original output
      let strippedPos = 0;
      let originalPos = 0;

      // eslint-disable-next-line no-control-regex
      const ansiRegex = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
      let match;

      // Build a mapping by walking through the original string
      while (strippedPos < lastHeaderIndex && originalPos < output.length) {
        ansiRegex.lastIndex = originalPos;
        match = ansiRegex.exec(output);

        if (match && match.index === originalPos) {
          originalPos = ansiRegex.lastIndex;
        } else {
          strippedPos++;
          originalPos++;
        }
      }

      // Back up to start of line in original
      let frameStart = originalPos;
      while (frameStart > 0 && output[frameStart - 1] !== '\n') {
        frameStart--;
      }
      frameOutput = output.substring(frameStart);
    }

    // Deduplicate repeated lines
    return deduplicateLines(frameOutput);
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
