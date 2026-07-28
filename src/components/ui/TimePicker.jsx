import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock } from 'lucide-react';

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const POPOVER_HEIGHT = 440;
const POPOVER_WIDTH = 280;

function splitTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  return match ? { hour: match[1], minute: match[2] } : { hour: '', minute: '' };
}

export function TimePicker({ name, label, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => splitTime(value));
  const [typedValue, setTypedValue] = useState(value || '');
  const [coords, setCoords] = useState(null);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const openUp = window.innerHeight - rect.bottom < POPOVER_HEIGHT + 12 && rect.top > POPOVER_HEIGHT;
    const width = Math.max(rect.width, POPOVER_WIDTH);
    setCoords({
      left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      width,
      openUp,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setDraft(splitTime(value));
      setTypedValue(value || '');
    }
  }, [value, open]);

  useEffect(() => {
    if (!open) return undefined;
    computePosition();
    const reposition = () => computePosition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (wrapperRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const apply = () => {
    if (!draft.hour || !draft.minute) return;
    onChange?.(`${draft.hour}:${draft.minute}`);
    setOpen(false);
  };

  const updateDraft = (next) => {
    setDraft(next);
    setTypedValue(next.hour && next.minute ? `${next.hour}:${next.minute}` : '');
  };

  const handleTypedValue = (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
    const nextValue = digits.length > 2
      ? `${digits.slice(0, 2)}:${digits.slice(2)}`
      : digits;
    setTypedValue(nextValue);
    const parsed = splitTime(nextValue);
    const valid = Number(parsed.hour) <= 23 && Number(parsed.minute) <= 59;
    setDraft(valid ? parsed : { hour: '', minute: '' });
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <input type="hidden" name={name} value={value || ''} />
      {label && <label className="block label-micro text-white/35 mb-2">{label}</label>}
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setDraft(splitTime(value));
          setOpen((current) => !current);
        }}
        className={`glass-input w-full flex items-center gap-3 text-left cursor-pointer ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-white/15'
        } ${open ? 'border-mint/30 shadow-[0_0_0_2px_rgba(73,220,122,0.08)]' : ''}`}
      >
        <Clock className={`w-4 h-4 shrink-0 ${open ? 'text-mint' : 'text-white/25'}`} />
        <span className={`flex-1 text-sm tabular-data ${value ? 'text-white/70' : 'text-white/20'}`}>
          {value || 'Selecionar horário'}
        </span>
        {value && (
          <span
            className="label-micro text-white/15 hover:text-white/40"
            onClick={(event) => {
              event.stopPropagation();
              onChange?.('');
            }}
          >
            limpar
          </span>
        )}
      </button>

      {open && coords && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={label || 'Selecionar horário'}
          className="motion-enter-fade rounded-xl overflow-hidden"
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            width: coords.width,
            transform: coords.openUp ? 'translateY(-100%)' : undefined,
            zIndex: 1000,
          }}
        >
          <div className="surface-elevated relative rounded-xl overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mint/25 to-transparent" />
            <div className="relative p-4">
              <label className="block label-micro text-white/40 mb-2">Digitar horário</label>
              <div className="relative mb-4">
                <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={5}
                  value={typedValue}
                  placeholder="HH:MM"
                  aria-label="Digitar horário no formato HH:MM"
                  className="glass-input pl-10 tabular-data"
                  onChange={handleTypedValue}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && draft.hour && draft.minute) apply();
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TimeColumn
                  label="Hora"
                  values={HOURS}
                  selected={draft.hour}
                  onSelect={(hour) => updateDraft({ ...draft, hour })}
                />
                <TimeColumn
                  label="Minuto"
                  values={MINUTES}
                  selected={draft.minute}
                  onSelect={(minute) => updateDraft({ ...draft, minute })}
                />
              </div>
              <button
                type="button"
                disabled={!draft.hour || !draft.minute}
                onClick={apply}
                className="manual-primary-action w-full mt-4 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                Aplicar {draft.hour && draft.minute ? `${draft.hour}:${draft.minute}` : 'horário'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function TimeColumn({ label, values, selected, onSelect }) {
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' });
  }, [selected]);

  return (
    <div>
      <div className="label-micro text-white/40 mb-2 text-center">{label}</div>
      <div className="surface-recessed rounded-xl p-1.5 h-52 overflow-y-auto overscroll-contain">
        {values.map((item) => (
          <button
            type="button"
            key={item}
            ref={selected === item ? selectedRef : null}
            onClick={() => onSelect(item)}
            className={`w-full rounded-lg py-2 text-sm tabular-data transition-colors ${
              selected === item
                ? 'bg-mint/15 text-mint font-semibold'
                : 'text-white/55 hover:text-white/90 hover:bg-white/[0.06]'
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
