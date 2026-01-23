'use client';

import { useEffect, useRef, useState } from 'react';
import type { Terminal as XTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

interface TerminalProps {
  output: string;
}

export function Terminal({ output }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastOutputLengthRef = useRef(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize xterm.js
  useEffect(() => {
    let mounted = true;
    let cleanupFn: (() => void) | undefined;

    const initTerminal = async () => {
      try {
        if (!terminalRef.current) {
          console.log('[Terminal] Waiting for ref...');
          return;
        }

        if (xtermRef.current) {
          console.log('[Terminal] Already initialized');
          return;
        }

        console.log('[Terminal] Initializing xterm.js...');

        // Dynamic import for client-side only
        const { Terminal: XTerm } = await import('@xterm/xterm');
        const { FitAddon } = await import('@xterm/addon-fit');

        if (!mounted) {
          console.log('[Terminal] Component unmounted during init');
          return;
        }

        if (!terminalRef.current) {
          console.log('[Terminal] Ref lost during init');
          return;
        }

        console.log('[Terminal] Creating terminal instance...');

        const term = new XTerm({
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            cursorAccent: '#1e1e1e',
            black: '#000000',
            red: '#f44747',
            green: '#4ec9b0',
            yellow: '#dcdcaa',
            blue: '#569cd6',
            magenta: '#c586c0',
            cyan: '#9cdcfe',
            white: '#d4d4d4',
            brightBlack: '#808080',
            brightRed: '#f44747',
            brightGreen: '#4ec9b0',
            brightYellow: '#dcdcaa',
            brightBlue: '#569cd6',
            brightMagenta: '#c586c0',
            brightCyan: '#9cdcfe',
            brightWhite: '#ffffff',
          },
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: 14,
          lineHeight: 1.2,
          cursorBlink: false,
          cursorStyle: 'block',
          scrollback: 5000,
          convertEol: true,
          allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        console.log('[Terminal] Opening terminal...');
        term.open(terminalRef.current);

        // Delay fit to ensure container is sized
        setTimeout(() => {
          if (mounted && fitAddon) {
            fitAddon.fit();
          }
        }, 50);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        lastOutputLengthRef.current = 0;

        console.log('[Terminal] Terminal ready!');
        setIsReady(true);

        // Handle resize
        const handleResize = () => {
          if (fitAddonRef.current && xtermRef.current) {
            try {
              fitAddonRef.current.fit();
            } catch (e) {
              console.error('[Terminal] Fit error:', e);
            }
          }
        };

        window.addEventListener('resize', handleResize);

        // ResizeObserver for container size changes
        const resizeObserver = new ResizeObserver(() => {
          handleResize();
        });
        if (terminalRef.current) {
          resizeObserver.observe(terminalRef.current);
        }

        cleanupFn = () => {
          window.removeEventListener('resize', handleResize);
          resizeObserver.disconnect();
        };
      } catch (err) {
        console.error('[Terminal] Init error:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize terminal');
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initTerminal, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (cleanupFn) cleanupFn();
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, []);

  // Write new output to terminal
  useEffect(() => {
    if (!xtermRef.current || !isReady) return;

    const term = xtermRef.current;

    // Only write new content (incremental updates)
    if (output.length > lastOutputLengthRef.current) {
      const newContent = output.substring(lastOutputLengthRef.current);
      term.write(newContent);
      lastOutputLengthRef.current = output.length;
    } else if (output.length < lastOutputLengthRef.current) {
      // Output was reset (new session or cleared)
      term.clear();
      term.write(output);
      lastOutputLengthRef.current = output.length;
    }
  }, [output, isReady]);

  // Refit on ready
  useEffect(() => {
    if (isReady && fitAddonRef.current) {
      // Small delay to ensure container is sized
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    }
  }, [isReady]);

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden relative">
      <div
        ref={terminalRef}
        className="flex-1"
        style={{ minHeight: '200px', padding: '8px' }}
      />
      {!isReady && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-[#1e1e1e]">
          Loading terminal...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-400 bg-[#1e1e1e] p-4 text-center">
          <div>
            <p>Terminal error: {error}</p>
            <p className="text-sm text-gray-500 mt-2">Try refreshing the page</p>
          </div>
        </div>
      )}
    </div>
  );
}
