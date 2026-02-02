import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = "", ...props }) => (
  <div className={`bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm ${className}`} {...props}>
    <div className="p-6">
      {children}
    </div>
  </div>
);