import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

const SIZE_MAP: Record<string, string> = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message,
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6">
      <div
        className={`${SIZE_MAP[size]} animate-spin rounded-full border-slate-600 border-t-blue-500`}
      />
      {message && (
        <p className="text-sm text-slate-400 animate-pulse">{message}</p>
      )}
    </div>
  );
};
