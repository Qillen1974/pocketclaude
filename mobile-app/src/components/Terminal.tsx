'use client';

import dynamic from 'next/dynamic';

// Dynamically import XTerminal with SSR disabled to avoid Next.js bundling issues
const XTerminal = dynamic(() => import('./XTerminal'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-gray-400 bg-[#1e1e1e]">
      Loading terminal...
    </div>
  ),
});

interface TerminalProps {
  output: string;
}

export function Terminal({ output }: TerminalProps) {
  return <XTerminal output={output} />;
}
