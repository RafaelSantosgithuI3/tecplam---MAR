import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, icon, className = "", ...props }, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 group-focus-within:text-blue-500 transition-colors pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={`w-full ${icon ? 'pl-10' : 'pl-3'} pr-3 py-2.5 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 outline-none text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 transition-all shadow-sm text-sm ${className}`}
          {...props}
        />
      </div>
    </div>
  );
});

Input.displayName = 'Input';