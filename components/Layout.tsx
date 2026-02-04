import React, { useState, useEffect } from 'react';
import { Menu, X, Sun, Moon } from 'lucide-react';

interface LayoutProps {
  children?: React.ReactNode;
  variant?: 'auth' | 'dashboard';
  sidebar?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children, variant = 'dashboard', sidebar }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Sync local state with DOM on mount
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setIsDark(!isDark);

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    localStorage.setItem('theme', newTheme);
  };

  if (variant === 'auth') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 font-sans relative overflow-hidden selection:bg-blue-500/30 selection:text-blue-200 transition-colors duration-300">
        {/* Toggle Button for Auth Screen */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/20 dark:bg-black/20 text-gray-700 dark:text-zinc-300 hover:bg-white/40 dark:hover:bg-zinc-800 transition-colors"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Ambient Background Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full h-full">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 font-sans selection:bg-blue-500/30 selection:text-blue-200 transition-colors duration-300">

      {/* Mobile/Tablet Header (Visible below lg breakpoint) */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 z-40 flex items-center justify-between px-4 shadow-md transition-colors duration-300">
        <div className="font-bold text-lg text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-900/20 overflow-hidden">
            <img src="/logo.png" className="w-full h-full object-contain" alt="LC" />
          </div>
          TECPLAM
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 focus:outline-none rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar (Collapsible on mobile/tablet, Fixed on desktop) */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 z-50 flex flex-col transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
      >
        {/* Wrapper to handle closing on click for mobile nav links */}
        <div className="flex flex-col h-full w-full relative" onClick={(e) => {
          // Close sidebar if clicking a link/button on mobile/tablet
          if (window.innerWidth < 1024) {
            // Only close if not clicking the toggle itself
            const target = e.target as HTMLElement;
            if (!target.closest('#theme-toggle')) {
              setIsSidebarOpen(false);
            }
          }
        }}>
          {sidebar}

          {/* TOGGLE BUTTON DESKTOP (Bottom Left of Sidebar) */}
          <div className="absolute bottom-4 right-4 hidden lg:block">
            <button
              id="theme-toggle"
              onClick={toggleTheme}
              className="p-2 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-zinc-700 transition-colors shadow-sm"
              title={isDark ? "Modo Claro" : "Modo Escuro"}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 min-h-screen transition-all duration-300 lg:ml-72 pt-16 lg:pt-0`}>
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
