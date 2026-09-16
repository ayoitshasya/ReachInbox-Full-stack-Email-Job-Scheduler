// Generic, reusable modal dialog (backdrop + header + scrollable body +
// optional footer) used as the base for feature-specific modals such as
// features/compose/ComposeModal.tsx.
import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // Optional action row (e.g. Cancel/Submit buttons) pinned to the bottom.
  footer?: ReactNode;
  // Tailwind max-width utility class, so callers can size the modal per use case.
  maxWidth?: string;
}

/**
 * Centered overlay dialog. Renders nothing when `open` is false. Closes via
 * the backdrop click, the X button, or the Escape key.
 *
 * @param open - Whether the modal is currently visible.
 * @param onClose - Called whenever the user dismisses the modal.
 * @param title - Heading text shown in the modal's header.
 * @param children - Main modal content, scrollable if it overflows.
 * @param footer - Optional fixed footer content (e.g. action buttons).
 * @param maxWidth - Tailwind width class controlling the modal's max width.
 */
export default function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-xl' }: ModalProps) {
  // close on escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* flex column + max-h so the modal never overflows the viewport */}
      <div className={`relative z-10 flex w-full flex-col ${maxWidth} max-h-[90vh] rounded-xl bg-white shadow-xl`}>
        {/* fixed header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* fixed footer — only rendered when passed */}
        {footer && (
          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
