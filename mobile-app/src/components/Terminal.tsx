'use client';

import { useEffect, useRef, useMemo } from 'react';
import { ansiToHtml, stripAnsi } from '@/lib/ansi';

interface TerminalProps {
  output: string;
}

// Claude Code header pattern - indicates start of a screen frame
const CLAUDE_HEADER = '▐▛███▜▌';

// Remove duplicate blocks from terminal output
function deduplicateContent(text: string): string {
  const stripped = stripAnsi(text);

  // Try to find repeated blocks by looking for the same content appearing multiple times
  const lines = text.split('\n');
  const strippedLines = stripped.split('\n');

  // Normalize lines for comparison (trim whitespace)
  const normalizedLines = strippedLines.map(line => line.trim());

  // First pass: remove consecutive identical lines (by trimmed content)
  const dedupedLines: string[] = [];
  const dedupedNormalized: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizedLines[i];
    if (i === 0 || normalized !== dedupedNormalized[dedupedNormalized.length - 1] || normalized === '') {
      dedupedLines.push(lines[i]);
      dedupedNormalized.push(normalized);
    }
  }

  // Second pass: detect repeated multi-line blocks and keep only the last
  const result: string[] = [];
  let i = 0;

  while (i < dedupedLines.length) {
    // Check if we have a repeating block starting here
    let blockSize = 0;

    // Try block sizes from 1 to 5 lines
    for (let size = 1; size <= Math.min(5, Math.floor((dedupedLines.length - i) / 2)); size++) {
      // Check if the next 'size' lines repeat (comparing trimmed content)
      let isRepeating = true;
      for (let k = 0; k < size; k++) {
        if (i + size + k >= dedupedLines.length ||
            dedupedNormalized[i + k] !== dedupedNormalized[i + size + k]) {
          isRepeating = false;
          break;
        }
      }
      if (isRepeating) {
        blockSize = size;
      }
    }

    if (blockSize > 0) {
      // Skip to the last occurrence of this repeating block
      let j = i + blockSize;
      while (j + blockSize <= dedupedLines.length) {
        let stillRepeating = true;
        for (let k = 0; k < blockSize; k++) {
          if (dedupedNormalized[i + k] !== dedupedNormalized[j + k]) {
            stillRepeating = false;
            break;
          }
        }
        if (stillRepeating) {
          j += blockSize;
        } else {
          break;
        }
      }
      // Add the last occurrence of the block
      for (let k = 0; k < blockSize; k++) {
        result.push(dedupedLines[j - blockSize + k]);
      }
      i = j;
    } else {
      result.push(dedupedLines[i]);
      i++;
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
