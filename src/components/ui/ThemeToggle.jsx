import { useTheme } from '../../hooks/useTheme';
import { useMotionPreference } from '../../hooks/useMotionPreference';
import { clsx } from 'clsx';
import { ThemeToggle as CurtainThemeToggle } from './curtain-theme-toggle';

/**
 * App-level adapter for the curtain theme toggle.
 * Keeps the visual transition connected to the persisted global theme store.
 */
export function ThemeToggle({ className }) {
  const { theme, setTheme } = useTheme();
  const { mode: motionMode } = useMotionPreference();

  return (
    <span className={clsx('relative flex h-9 w-9 items-center justify-center', className)}>
      <CurtainThemeToggle
        variant="icon"
        theme={theme}
        buttonSize={36}
        duration={motionMode === 'off' ? 0 : motionMode === 'reduced' ? 260 : 550}
        onThemeChange={setTheme}
      />
    </span>
  );
}
