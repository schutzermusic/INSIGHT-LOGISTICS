import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../../hooks/useTheme';
import { prefetchRoute } from '../../App';

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
              ? 'drop-shadow-[0_4px_16px_rgba(73,220,122,0.12)]'
              : 'drop-shadow-[0_4px_12px_rgba(15,50,40,0.15)]',
          )}
        />
      </div>

      {/* Centered nav pill — cinematic glass */}
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5',
          'surface-elevated py-1.5 px-1.5 rounded-full',
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
              onMouseEnter={() => prefetchRoute(item.url)}
              onFocus={() => prefetchRoute(item.url)}
              className={cn(
                'relative cursor-pointer text-[13px] font-medium px-5 py-2 rounded-full transition-colors whitespace-nowrap',
                isDark
                  ? 'text-white/45 hover:text-white/80'
                  : 'text-[rgb(15,30,24)]/55 hover:text-[rgb(15,30,24)]',
                isActive && (isDark ? 'text-[#0A1E18]' : 'text-[rgb(15,30,24)]'),
              )}
            >
              <span className="hidden md:inline relative z-10">{item.name}</span>
              <span className="md:hidden relative z-10">
                <Icon size={18} strokeWidth={2.5} />
              </span>
              {isActive && (
                <motion.div
                  layoutId="tubelight"
                  className="absolute inset-0 rounded-full -z-0"
                  style={{
                    background: isDark
                      ? 'linear-gradient(180deg, #ffffff 0%, #e8ede9 100%)'
                      : 'linear-gradient(180deg, rgba(73,220,122,0.18) 0%, rgba(73,220,122,0.10) 100%)',
                    boxShadow: isDark
                      ? '0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 14px -4px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.05)'
                      : '0 1px 0 rgba(255,255,255,0.7) inset, 0 2px 10px -2px rgba(12,122,60,0.18), 0 0 0 1px rgba(12,122,60,0.15)',
                  }}
                  initial={false}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                >
                  {/* subtle top sheen beam — preserves the "tubelight" signature */}
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full"
                       style={{
                         background: isDark ? '#49DC7A' : '#49DC7A',
                         boxShadow: '0 0 12px rgba(73,220,122,0.9), 0 0 24px rgba(73,220,122,0.5)',
                       }}
                  />
                </motion.div>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Right cluster — theme toggle in a glass capsule */}
      <div
        className={cn(
          'surface-elevated flex items-center gap-1 shrink-0 px-1.5 py-1.5 rounded-full',
        )}
      >
        <ThemeToggle />
      </div>
    </div>
  );
}
