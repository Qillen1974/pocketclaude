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

  // Initialize xterm.js
  useEffect(() => {
    let mounted = true;

    const initTerminal = async () => {
      if (!terminalRef.current || xtermRef.current) return;

      // Dynamic import for client-side only
      const { Terminal: XTerm } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');

      // CSS is imported in layout.tsx or globals.css

      if (!mounted || !terminalRef.current) return;

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
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      term.open(terminalRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;
      lastOutputLengthRef.current = 0;

      setIsReady(true);

      // Handle resize
      const handleResize = () => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      };

      window.addEventListener('resize', handleResize);

      // ResizeObserver for container size changes
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(terminalRef.current);

      return () => {
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
      };
    };

    initTerminal();

    return () => {
      mounted = false;
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
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ minHeight: '200px' }}
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          Loading terminal...
        </div>
      )}
    </div>
  );
}
