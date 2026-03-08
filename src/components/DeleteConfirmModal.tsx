import React, { useEffect, useRef } from 'react';

interface DeleteConfirmModalProps {
  open: boolean;
  chatTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  open,
  chatTitle,
  onCancel,
  onConfirm,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  // Focus trap
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 mx-4 w-full max-w-sm animate-fade-up rounded-2xl border border-surface-border/50 bg-canvas-elevated p-6 shadow-2xl shadow-black/40 outline-none"
      >
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </div>

        {/* Title */}
        <h3 className="text-center text-[15px] font-semibold text-text-primary">
          Delete this chat?
        </h3>

        {/* Description */}
        <p className="mt-2 text-center text-[13px] leading-relaxed text-text-muted">
          <span className="font-medium text-text-secondary">"{chatTitle}"</span> and all its messages will be permanently deleted.
        </p>

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-surface-border/50 bg-surface/30 py-2.5 text-[13px] font-medium text-text-secondary transition-all duration-200 hover:bg-surface/60 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-500/90 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-red-500/20 transition-all duration-200 hover:bg-red-500 hover:shadow-red-500/30"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};
