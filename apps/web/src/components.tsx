import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
}) {
  return (
    <button type={type} className={`button button--${variant} ${className}`} {...props} />
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="field__error">
          Error: {error}
        </p>
      )}
    </div>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="4" fill="currentColor" />
      <path d="M7 7h5v7h8V7h5v18h-5v-6h-8v6H7z" fill="var(--color-cream)" />
      <path d="M20 19h5v6h-5z" fill="var(--color-coral)" />
    </svg>
  );
}

export function Icon({ name }: { name: 'info' | 'back' | 'send' | 'stop' | 'close' | 'book' }) {
  const shapes = {
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></>,
    back: <path d="m14 5-7 7 7 7M7 12h13" />,
    send: <><path d="m4 4 17 8-17 8 3-8-3-8ZM7 12h14" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    book: <><path d="M4 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-3-1H4V4ZM14 7h6v13h-6" /><path d="M7 8h3M7 12h3" /></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}
