import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md',
  fullWidth = false, 
  className = '', 
  ...props 
}) => {
  let baseStyles = "rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-zinc-950";
  
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 border border-transparent focus:ring-blue-500",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 hover:border-zinc-600 focus:ring-zinc-500",
    danger: "bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 focus:ring-red-500",
    success: "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 focus:ring-green-500",
    outline: "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 bg-transparent focus:ring-zinc-500",
    ghost: "bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-transparent"
  };

  return (
    <button 
      className={`${baseStyles} ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};