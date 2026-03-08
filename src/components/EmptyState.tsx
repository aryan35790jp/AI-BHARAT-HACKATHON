import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
}) => {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-12 text-center">
      {icon && <div className="text-slate-600">{icon}</div>}
      <div>
        <h3 className="text-lg font-semibold text-slate-300">{title}</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
};
