// Reusable styled form field components (a single-line Input and a
// multi-line Textarea) sharing the same visual treatment, optional label,
// and optional inline error message. Used throughout ComposeModal.tsx.
import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

// Shared Tailwind classes for both Input and Textarea so their look stays
// in sync; Textarea adds `resize-none` on top of this.
const inputBase = `
  w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900
  placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
  disabled:bg-gray-50 disabled:text-gray-500
`;

/**
 * Styled single-line text input with an optional label above it and an
 * optional error message below it. Forwards its ref to the underlying
 * <input> so parent forms can focus/read it directly if needed.
 *
 * @param label - Optional field label rendered above the input.
 * @param error - Optional validation message; when present, also highlights
 *                the input border in red.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <input ref={ref} {...props} className={`${inputBase} ${error ? 'border-red-400' : ''} ${className}`} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
});

/**
 * Styled multi-line text area, matching Input's label/error/styling
 * conventions but for longer free-form text (e.g. the email body).
 *
 * @param label - Optional field label rendered above the textarea.
 * @param error - Optional validation message; when present, also highlights
 *                the textarea border in red.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className = '', ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <textarea
        ref={ref}
        {...props}
        className={`${inputBase} resize-none ${error ? 'border-red-400' : ''} ${className}`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
});
