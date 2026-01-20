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
  // Look for patterns like: "text\n---\ntext\n---\n" and keep only the last occurrence
  const lines = text.split('\n');
  const strippedLines = stripped.split('\n');

  // First pass: remove consecutive identical lines
  const dedupedLines: string[] = [];
  const dedupedStripped: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const strippedLine = strippedLines[i];
    if (i === 0 || strippedLine !== dedupedStripped[dedupedStripped.length - 1] || strippedLine.trim() === '') {
      dedupedLines.push(lines[i]);
      dedupedStripped.push(strippedLine);
    }
  }

  // Second pass: detect repeated multi-line blocks and keep only the last
  // Look for a block that repeats (e.g., user input followed by divider)
  const result: string[] = [];
  let i = 0;

  while (i < dedupedLines.length) {
    // Check if we have a repeating block starting here
    let blockSize = 0;

    // Try block sizes from 1 to 5 lines
    for (let size = 1; size <= Math.min(5, Math.floor((dedupedLines.length - i) / 2)); size++) {
      // Check if the next 'size' lines repeat
      let isRepeating = true;
      for (let k = 0; k < size; k++) {
        if (i + size + k >= dedupedLines.length ||
            dedupedStripped[i + k] !== dedupedStripped[i + size + k]) {
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
          if (dedupedStripped[i + k] !== dedupedStripped[j + k]) {
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
