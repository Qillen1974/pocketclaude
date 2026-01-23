'use client';

import { useEffect, useRef, useState } from 'react';

interface XTerminalProps {
  output: string;
}

export default function XTerminal({ output }: XTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const lastOutputLengthRef = useRef(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize xterm.js
  useEffect(() => {
    let mounted = true;
    let term: any = null;
    let fitAddon: any = null;
    let resizeObserver: ResizeObserver | null = null;

    const initTerminal = async () => {
      try {
        if (!terminalRef.current) {
          console.log('[XTerminal] No ref');
          return;
        }

        if (xtermRef.current) {
          console.log('[XTerminal] Already initialized');
          return;
        }

        console.log('[XTerminal] Loading modules...');

        // Import xterm modules
        const xtermModule = await import('@xterm/xterm');
        const fitModule = await import('@xterm/addon-fit');

        if (!mounted || !terminalRef.current) return;

        const Terminal = xtermModule.Terminal;
        const FitAddon = fitModule.FitAddon;

        console.log('[XTerminal] Creating terminal...');

        term = new Terminal({
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
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 14,
          lineHeight: 1.2,
          cursorBlink: false,
          scrollback: 5000,
          convertEol: true,
        });

        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        console.log('[XTerminal] Opening...');
        term.open(terminalRef.current);

        // Fit after a small delay
        setTimeout(() => {
          if (mounted && fitAddon) {
            try {
              fitAddon.fit();
            } catch (e) {
              console.error('[XTerminal] Fit error:', e);
            }
          }
        }, 100);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        lastOutputLengthRef.current = 0;

        console.log('[XTerminal] Ready!');
        setIsReady(true);

        // Handle resize
        const handleResize = () => {
          if (fitAddonRef.current) {
            try {
              fitAddonRef.current.fit();
            } catch (e) {
              // Ignore fit errors during resize
            }
          }
        };

        window.addEventListener('resize', handleResize);

        resizeObserver = new ResizeObserver(handleResize);
        if (terminalRef.current) {
          resizeObserver.observe(terminalRef.current);
        }

      } catch (err) {
        console.error('[XTerminal] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load terminal');
      }
    };

    // Delay to ensure DOM is ready
    const timer = setTimeout(initTerminal, 50);

    return () => {
      mounted = false;
      clearTimeout(timer);
      window.removeEventListener('resize', () => {});
      if (resizeObserver) resizeObserver.disconnect();
      if (xtermRef.current) {
        try {
          xtermRef.current.dispose();
        } catch (e) {
          // Ignore dispose errors
        }
        xtermRef.current = null;
      }
    };
  }, []);

  // Write output to terminal
  useEffect(() => {
    if (!xtermRef.current || !isReady) return;

    const term = xtermRef.current;

    if (output.length > lastOutputLengthRef.current) {
      const newContent = output.substring(lastOutputLengthRef.current);
      term.write(newContent);
      lastOutputLengthRef.current = output.length;
    } else if (output.length < lastOutputLengthRef.current) {
      // Reset
      term.clear();
      term.write(output);
      lastOutputLengthRef.current = output.length;
    }
  }, [output, isReady]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400 bg-[#1e1e1e] p-4 text-center">
        <div>
          <p>Terminal error: {error}</p>
          <p className="text-sm text-gray-500 mt-2">Try refreshing the page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden relative">
      <div
        ref={terminalRef}
        className="flex-1"
        style={{ minHeight: '200px', padding: '4px' }}
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-[#1e1e1e]">
          Loading terminal...
        </div>
      )}
    </div>
  );
}
