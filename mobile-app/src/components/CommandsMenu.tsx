'use client';

import { useState, useRef, useEffect } from 'react';
import { CustomCommand } from '@/lib/types';

interface CommandsMenuProps {
  commands: CustomCommand[];
  onSelect: (command: CustomCommand) => void;
  disabled?: boolean;
}

export function CommandsMenu({ commands, onSelect, disabled }: CommandsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (command: CustomCommand) => {
    onSelect(command);
    setIsOpen(false);
  };

  if (commands.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1"
        title="Custom Commands"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 17l6-6-6-6" />
          <path d="M12 19h8" />
        </svg>
        <span className="text-xs">{commands.length}</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-64 max-h-80 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50">
          <div className="p-2 border-b border-gray-700">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Custom Commands</span>
          </div>
          <div className="py-1">
            {commands.map((command) => (
              <button
                key={command.name}
                onClick={() => handleSelect(command)}
                className="w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors"
              >
                <div className="text-sm text-white font-medium">/{command.name}</div>
                <div className="text-xs text-gray-400 truncate">{command.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
