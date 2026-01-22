'use client';

import { useState, FormEvent, KeyboardEvent } from 'react';
import { FileUploadButton } from './FileUploadButton';

interface InputBarProps {
  onSubmit: (input: string) => void;
  onUpload?: (fileName: string, fileContent: string, mimeType?: string) => void;
  uploadStatus?: 'idle' | 'uploading' | 'success' | 'error';
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({ onSubmit, onUpload, uploadStatus = 'idle', disabled, placeholder = 'Type a message...' }: InputBarProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSubmit(input + '\r');
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Arrow keys - send escape sequences for terminal navigation
    // These are used for selecting options in Claude's prompts
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onSubmit('\x1b[A');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onSubmit('\x1b[B');
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSubmit('\x1b[D');
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSubmit('\x1b[C');
      return;
    }
    // Escape key - useful for canceling operations in Claude
    if (e.key === 'Escape') {
      e.preventDefault();
      onSubmit('\x1b');
      return;
    }
    // Enter key - submit the input
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-700 bg-gray-800 p-4">
      <div className="flex gap-2 items-center">
        {onUpload && (
          <FileUploadButton
            onUpload={onUpload}
            uploadStatus={uploadStatus}
            disabled={disabled}
          />
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-gray-900 text-white rounded-lg px-4 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </form>
  );
}
