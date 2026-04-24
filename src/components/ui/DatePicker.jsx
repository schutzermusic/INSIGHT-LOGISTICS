import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Glass Liquid Calendar Styles — theme-aware via CSS tokens.
// Every color reads from --ink / --glass-ink / --mint-ink so the
// calendar renders correctly in both light and dark themes.
// ═══════════════════════════════════════════════════════════════
const GLASS_CALENDAR_STYLES = `
.glass-cal {
  --cell: 36px;
  width: fit-content;
}

.glass-cal .rdp-months {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.glass-cal .rdp-month { width: 100%; }

.glass-cal .rdp-month_caption {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  margin: 0 40px 4px;
  z-index: 20;
}
.glass-cal .rdp-caption_label {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--ink) / 0.85);
  text-transform: capitalize;
  letter-spacing: -0.01em;
}

.glass-cal .rdp-nav {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  z-index: 30;
}
.glass-cal .rdp-button_previous,
.glass-cal .rdp-button_next {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgb(var(--glass-ink) / 0.08);
  background: rgb(var(--glass-ink) / 0.04);
  color: rgb(var(--ink) / 0.45);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
  backdrop-filter: blur(8px);
}
.glass-cal .rdp-button_previous:hover,
.glass-cal .rdp-button_next:hover {
  background: rgb(var(--glass-ink) / 0.10);
  border-color: rgb(var(--glass-ink) / 0.16);
  color: rgb(var(--ink) / 0.85);
  box-shadow: 0 0 12px rgb(var(--mint-ink) / 0.14);
}

.glass-cal .rdp-weekday {
  width: var(--cell);
  height: var(--cell);
  padding: 0;
  font-size: 10px;
  font-weight: 700;
  color: rgb(var(--ink) / 0.3);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  text-align: center;
  vertical-align: middle;
}

.glass-cal .rdp-day {
  width: var(--cell);
  height: var(--cell);
  padding: 0;
  text-align: center;
}
.glass-cal .rdp-day_button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--cell);
  height: var(--cell);
  border-radius: 10px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: rgb(var(--ink) / 0.6);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
  outline: none;
}

.glass-cal .rdp-day_button:hover {
  background: rgb(var(--glass-ink) / 0.08);
  color: rgb(var(--ink) / 0.95);
  box-shadow: 0 0 0 1px rgb(var(--glass-ink) / 0.12);
}

/* Selected — brand mint gradient, readable on both themes */
.glass-cal .rdp-selected .rdp-day_button {
  background: linear-gradient(135deg, #49DC7A, #2DB85C) !important;
  color: #0a0f0a !important;
  font-weight: 700;
  box-shadow:
    0 0 20px rgba(73,220,122,0.25),
    0 0 0 2px rgba(73,220,122,0.18),
    inset 0 1px 0 rgba(255,255,255,0.2);
  transform: scale(1.05);
}

.glass-cal .rdp-today:not(.rdp-selected) .rdp-day_button {
  color: rgb(var(--mint-ink));
  font-weight: 700;
}
.glass-cal .rdp-today:not(.rdp-selected) .rdp-day_button::after {
  content: '';
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgb(var(--mint-ink));
  box-shadow: 0 0 6px rgb(var(--mint-ink) / 0.55);
}

.glass-cal .rdp-outside .rdp-day_button {
  color: rgb(var(--ink) / 0.18);
}
.glass-cal .rdp-outside .rdp-day_button:hover {
  color: rgb(var(--ink) / 0.32);
  background: rgb(var(--glass-ink) / 0.04);
  box-shadow: none;
}

.glass-cal .rdp-disabled .rdp-day_button {
  color: rgb(var(--ink) / 0.15);
  cursor: not-allowed;
  text-decoration: line-through;
}
.glass-cal .rdp-disabled .rdp-day_button:hover {
  background: transparent;
  box-shadow: none;
  color: rgb(var(--ink) / 0.15);
}

.glass-cal .rdp-day_button:focus-visible {
  outline: 2px solid rgb(var(--mint-ink) / 0.5);
  outline-offset: 2px;
}

.glass-cal .rdp-week_number {
  width: var(--cell);
  height: var(--cell);
  font-size: 10px;
  font-weight: 600;
  color: rgb(var(--ink) / 0.18);
}

.glass-cal .rdp-month_grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 2px;
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.textContent = GLASS_CALENDAR_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

function CustomChevron({ orientation, ...props }) {
  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
  return <Icon size={15} strokeWidth={2.5} {...props} />;
}

export function DatePicker({ name, label, value, onChange, disabled, minDate }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(value ? parseISO(value) : undefined);
  const ref = useRef(null);

  injectStyles();

  // Sync external value changes
  useEffect(() => {
    setSelected(value ? parseISO(value) : undefined);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleSelect = (day) => {
    setSelected(day);
    setOpen(false);
    onChange?.(day ? format(day, 'yyyy-MM-dd') : '');
  };

  const displayValue = selected ? format(selected, 'dd/MM/yyyy') : '';

  return (
    <div className="relative" ref={ref}>
      {/* Hidden input for form compatibility */}
      <input type="hidden" name={name} value={selected ? format(selected, 'yyyy-MM-dd') : ''} />

      {label && (
        <label className="block label-micro text-white/35 mb-2">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`glass-input w-full flex items-center gap-3 text-left cursor-pointer transition-all duration-200 ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-white/15'
        } ${open ? 'border-mint/30 shadow-[0_0_0_2px_rgba(73,220,122,0.08)]' : ''}`}
      >
        <Calendar className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${open ? 'text-mint' : 'text-white/25'}`} />
        <span className={`flex-1 text-sm tabular-data ${displayValue ? 'text-white/70' : 'text-white/20'}`}>
          {displayValue || 'Selecionar data'}
        </span>
        {displayValue && (
          <span
            className="label-micro text-white/15 hover:text-white/40 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setSelected(undefined);
              onChange?.('');
            }}
          >
            limpar
          </span>
        )}
      </button>

      {/* Calendar Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-2 rounded-xl overflow-hidden animate-fade-in"
          style={{ minWidth: 296 }}
        >
          {/* Glass container */}
          <div className="surface-elevated relative rounded-xl">
            {/* Top glow line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mint/25 to-transparent" />

            {/* Ambient glow */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-16 bg-mint/[0.06] rounded-full blur-2xl pointer-events-none" />

            {/* Inner content */}
            <div className="relative p-4">
              <DayPicker
                className="glass-cal"
                mode="single"
                selected={selected}
                onSelect={handleSelect}
                locale={ptBR}
                showOutsideDays
                disabled={minDate ? { before: minDate } : undefined}
                defaultMonth={selected || new Date()}
                components={{
                  Chevron: CustomChevron,
                }}
              />
            </div>

            {/* Bottom subtle border glow */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
          </div>
        </div>
      )}
    </div>
  );
}
