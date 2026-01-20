'use client';

import { useEffect, useRef, useMemo } from 'react';
import { ansiToHtml, stripAnsi } from '@/lib/ansi';

interface TerminalProps {
  output: string;
}

// Claude Code header pattern - indicates start of a screen frame
const CLAUDE_HEADER = '▐▛███▜▌';

// Check if a line is "meaningful" (not just whitespace, dividers, or common UI elements)
function isMeaningfulLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Skip divider lines (all dashes/boxes)
  if (/^[─━═┄┈\-]+$/.test(trimmed)) return false;
  // Skip common UI hints
  if (trimmed.startsWith('ctrl+') || trimmed === '? for shortcuts') return false;
  return true;
}

// Remove duplicate content from terminal output
function deduplicateContent(text: string): string {
  const stripped = stripAnsi(text);
  const lines = text.split('\n');
  const strippedLines = stripped.split('\n');
  const normalizedLines = strippedLines.map(line => line.trim());

  // First pass: remove consecutive identical lines
  const dedupedLines: string[] = [];
  const dedupedNormalized: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizedLines[i];
    if (i === 0 || normalized !== dedupedNormalized[dedupedNormalized.length - 1] || normalized === '') {
      dedupedLines.push(lines[i]);
      dedupedNormalized.push(normalized);
    }
  }

  // Second pass: find meaningful lines and check for duplicates
  // Keep track of seen meaningful content and only keep the last occurrence
  const meaningfulContentLastIndex = new Map<string, number>();

  for (let i = 0; i < dedupedNormalized.length; i++) {
    if (isMeaningfulLine(dedupedNormalized[i])) {
      meaningfulContentLastIndex.set(dedupedNormalized[i], i);
    }
  }

  // Build result, skipping earlier occurrences of repeated meaningful content
  const seenMeaningful = new Set<string>();
  const result: string[] = [];

  // Process in reverse to keep last occurrence
  for (let i = dedupedLines.length - 1; i >= 0; i--) {
    const normalized = dedupedNormalized[i];
    if (isMeaningfulLine(normalized)) {
      if (!seenMeaningful.has(normalized)) {
        seenMeaningful.add(normalized);
        result.unshift(dedupedLines[i]);
      }
      // Skip earlier occurrences
    } else {
      // Non-meaningful lines: keep them but avoid excessive consecutive dividers/blanks
      result.unshift(dedupedLines[i]);
    }
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

    // Deduplicate repeated content blocks
    return deduplicateContent(frameOutput);
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
