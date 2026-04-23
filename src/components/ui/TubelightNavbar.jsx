import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../../hooks/useTheme';

export function NavBar({ items, className }) {
  const [, setIsMobile] = useState(false);
  const location = useLocation();
  const { isDark } = useTheme();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4',
        className,
      )}
    >
      {/* Logo */}
      <div className="flex items-center shrink-0">
        <img
          src="/INSIGHT-LOGISTICS-LOGO.png"
          alt="Insight Logistics"
          className={cn(
            'h-12 w-auto transition-[filter] duration-300',
            isDark
              ? 'drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]'
              : 'drop-shadow-[0_4px_12px_rgba(15,50,40,0.15)]',
          )}
        />
      </div>

      {/* Centered nav pill */}
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 flex items-center gap-1',
          'py-1.5 px-2 rounded-full backdrop-blur-2xl',
          'bg-dark-900/70 border border-white/[0.06]',
          'shadow-[0_4px_24px_rgb(var(--shadow-ink)/0.12)]',
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.match
            ? item.match(location.pathname)
            : location.pathname === item.url;

          return (
            <NavLink
              key={item.name}
              to={item.url}
              className={cn(
                'relative cursor-pointer text-sm font-medium px-5 py-2 rounded-full transition-colors whitespace-nowrap',
                'text-white/40 hover:text-white/70',
                isActive && 'text-white',
              )}
            >
              <span className="hidden md:inline">{item.name}</span>
              <span className="md:hidden">
                <Icon size={18} strokeWidth={2.5} />
              </span>
              {isActive && (
                <motion.div
                  layoutId="tubelight"
                  className="absolute inset-0 w-full bg-white/[0.06] rounded-full -z-10"
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 350,
                    damping: 30,
                  }}
                >
                  {/* Tubelight glow effect */}
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-mint rounded-t-full">
                    <div className="absolute w-16 h-8 bg-mint/20 rounded-full blur-lg -top-3 -left-3" />
                    <div className="absolute w-10 h-6 bg-mint/25 rounded-full blur-md -top-1.5 -left-0" />
                    <div className="absolute w-6 h-4 bg-mint/30 rounded-full blur-sm top-0 left-2" />
                  </div>
                </motion.div>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Right cluster — theme toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <ThemeToggle />
      </div>
    </div>
  );
}
