// Reusable styled button component shared across the app (used in Header,
// Dashboard, ComposeModal, etc.) so button appearance stays consistent
// without repeating Tailwind class strings everywhere.
import type { ButtonHTMLAttributes } from 'react';

// Extends the native <button> props so callers can still pass onClick,
// type, disabled, etc. straight through, plus our own styling options.
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

// Tailwind class sets per visual variant, keyed so they can be looked up
// dynamically from the `variant` prop below.
const variantClasses = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50',
  ghost: 'text-gray-600 hover:bg-gray-100 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

/**
 * Styled <button> supporting a small set of visual variants/sizes and a
 * built-in loading spinner state. All other native button props (onClick,
 * type, disabled, etc.) pass straight through via `...props`.
 *
 * @param variant - Visual style; defaults to 'primary'.
 * @param size - Padding/text size preset; defaults to 'md'.
 * @param loading - When true, shows a spinner and disables the button even
 *                   if `disabled` wasn't explicitly set.
 * @param disabled - Standard HTML disabled flag; combined with `loading`.
 * @param children - Button label/content.
 * @param className - Extra classes appended after the built-in styling.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`
        inline-flex items-center gap-2 rounded-md font-medium transition-colors
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${disabled || loading ? 'cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `.trim()}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path
            fill="currentColor"
            className="opacity-75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
