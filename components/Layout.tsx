
import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

interface LayoutProps {
  children?: React.ReactNode;
  variant?: 'auth' | 'dashboard';
  sidebar?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children, variant = 'dashboard', sidebar }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (variant === 'auth') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans relative overflow-hidden selection:bg-blue-500/30 selection:text-blue-200">
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
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 selection:text-blue-200">
      
      {/* Mobile/Tablet Header (Visible below lg breakpoint) */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-zinc-900 border-b border-zinc-800 z-40 flex items-center justify-between px-4 shadow-md">
        <div className="font-bold text-lg text-zinc-100 tracking-tight flex items-center gap-2">
           <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-900/20 overflow-hidden">
             <img src="/logo.png" className="w-full h-full object-contain" alt="LC" />
           </div>
           TECPLAM
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
          className="p-2 text-zinc-400 hover:text-zinc-100 focus:outline-none rounded-lg hover:bg-zinc-800 transition-colors"
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
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
        className={`fixed left-0 top-0 bottom-0 w-72 bg-zinc-900 border-r border-zinc-800 z-50 flex flex-col transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Wrapper to handle closing on click for mobile nav links */}
        <div className="flex flex-col h-full w-full" onClick={(e) => {
            // Close sidebar if clicking a link/button on mobile/tablet
            if(window.innerWidth < 1024) {
               setIsSidebarOpen(false);
            }
        }}>
            {sidebar}
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
