import React from 'react';

interface CardProps {
  children?: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = "" }) => (
  <div className={`bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm ${className}`}>
    <div className="p-6">
      {children}
    </div>
  </div>
);