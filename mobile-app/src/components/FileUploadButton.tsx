'use client';

import { useRef, ChangeEvent } from 'react';

interface FileUploadButtonProps {
  onUpload: (fileName: string, fileContent: string, mimeType?: string) => void;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUploadButton({ onUpload, uploadStatus, disabled }: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    e.target.value = '';

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      alert('File size exceeds 10MB limit');
      return;
    }

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64Content = result.split(',')[1];
        onUpload(file.name, base64Content, file.type);
      };
      reader.onerror = () => {
        alert('Failed to read file');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File read error:', err);
      alert('Failed to read file');
    }
  };

  const getButtonContent = () => {
    switch (uploadStatus) {
      case 'uploading':
        return (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        );
      case 'success':
        return (
          <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        );
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || uploadStatus === 'uploading'}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || uploadStatus === 'uploading'}
        className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Upload file"
      >
        {getButtonContent()}
      </button>
    </>
  );
}
