import { type ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function Card({ title, children, className = '', action }: CardProps) {
  return (
    <div className={`glass-card glass-card-hover p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-base font-semibold text-text-primary">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
