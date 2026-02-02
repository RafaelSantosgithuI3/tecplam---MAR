import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, icon, className = "", ...props }, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-blue-500 transition-colors pointer-events-none">
            {icon}
          </div>
        )}
        <input 
          ref={ref}
          className={`w-full ${icon ? 'pl-10' : 'pl-3'} pr-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 outline-none text-zinc-100 placeholder-zinc-600 transition-all shadow-inner text-sm ${className}`}
          {...props}
        />
      </div>
    </div>
  );
});

Input.displayName = 'Input';