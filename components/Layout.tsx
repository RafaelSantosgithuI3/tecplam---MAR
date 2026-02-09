import React, { useState, useEffect } from 'react';
import { Menu, X, Sun, Moon } from 'lucide-react';

interface LayoutProps {
  children?: React.ReactNode;
  variant?: 'auth' | 'dashboard';
  sidebar?: React.ReactNode;
  // New props for controlled theme
  onToggleTheme?: () => void;
  isDark?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, variant = 'dashboard', sidebar, onToggleTheme, isDark = true }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Internal fallback if not controlled (optional, but for safety)
  // But strictly we should use the props passed from App

  const handleToggle = onToggleTheme || (() => { });

  if (variant === 'auth') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 font-sans relative overflow-hidden transition-colors duration-200">
        <div className="absolute top-4 right-4 z-50">
          <button onClick={handleToggle} className="p-2 rounded-full bg-white dark:bg-zinc-800 shadow-md hover:scale-110 transition-transform text-zinc-800 dark:text-zinc-200">
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
        <div className="relative z-10 w-full h-full">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans transition-colors duration-200">

      {/* Mobile/Tablet Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 z-40 flex items-center justify-between px-4 shadow-sm transition-colors duration-200">
        <div className="font-bold text-lg tracking-tight flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
            <img src="/logo.png" className="w-full h-full object-contain" alt="LC" />
          </div>
          TECPLAM
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleToggle} className="p-2 text-gray-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-zinc-100 transition-colors">
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 z-50 flex flex-col transition-all duration-300 shadow-xl lg:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
      >
        <div className="flex flex-col h-full w-full relative">
          {/* Toggle Button Removed from absolute position - should be integrated in Sidebar content */}

          <div onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)}>
            {sidebar}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen transition-all duration-300 lg:ml-72 pt-16 lg:pt-0">
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
