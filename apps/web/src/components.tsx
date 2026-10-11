import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  return <button type={type} className={`button button--${variant} ${className}`} {...props} />;
}

export function Field({
  id, label, hint, error, children,
}: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-hint`} className="field__hint">{hint}</p>}
      {children}
      {error && <p id={`${id}-error`} className="field__error">Error: {error}</p>}
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

export function WelcomeArtwork() {
  return (
    <svg className="welcome-art" viewBox="0 0 440 440" aria-hidden="true">
      <g fill="var(--color-cream)">
        <path d="M40 64h240v32H40zM40 120h184v32H40zM40 176h128v32H40z" />
        <path d="M248 224h48v48h-48zM296 272h48v48h-48zM344 320h48v48h-48z" />
      </g>
      <g fill="var(--color-coral)">
        <path d="M328 64h64v64h-64zM264 128h64v64h-64zM200 192h64v64h-64z" />
        <path d="M48 304h112v112H48z" />
      </g>
      <g fill="var(--color-gold)">
        <path d="M48 256h48v48H48zM160 368h48v48h-48z" />
        <circle cx="348" cy="200" r="28" />
      </g>
      <path d="M64 320h80v16H64zM64 352h80v16H64zM64 384h80v16H64z" fill="var(--color-teal)" />
    </svg>
  );
}
