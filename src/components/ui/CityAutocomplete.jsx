import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Search, ChevronDown } from 'lucide-react';

/**
 * Normalize string: remove diacritics/accents and lowercase
 * "São Paulo" → "sao paulo"
 */
function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * CityAutocomplete — glass-style autocomplete with fuzzy accent-insensitive search
 */
export function CityAutocomplete({
  name,
  placeholder = 'Buscar cidade...',
  cities = [],
  icon,
  iconColor = 'mint',
  required = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);

  // Filter cities based on normalized query
  const filtered = useCallback(() => {
    if (!query.trim()) return cities.slice(0, 30);
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return cities
      .filter(city => {
        const norm = normalize(city);
        return terms.every(t => norm.includes(t));
      })
      .slice(0, 30);
  }, [query, cities]);

  const results = filtered();

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.children[highlightIndex];
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, open]);

  const handleSelect = (city) => {
    setSelected(city);
    setQuery(city);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[highlightIndex]) {
          handleSelect(results[highlightIndex]);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSelected('');
    setOpen(true);
    setHighlightIndex(0);
  };

  // Highlight matched text
  const highlightMatch = (text) => {
    if (!query.trim()) return text;
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const normText = normalize(text);

    // Find all match ranges
    const ranges = [];
    for (const term of terms) {
      let idx = normText.indexOf(term);
      while (idx !== -1) {
        ranges.push([idx, idx + term.length]);
        idx = normText.indexOf(term, idx + 1);
      }
    }
    if (ranges.length === 0) return text;

    // Merge overlapping ranges
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) {
        last[1] = Math.max(last[1], ranges[i][1]);
      } else {
        merged.push(ranges[i]);
      }
    }

    // Build segments
    const parts = [];
    let cursor = 0;
    for (const [start, end] of merged) {
      if (cursor < start) parts.push(<span key={cursor}>{text.slice(cursor, start)}</span>);
      parts.push(<span key={start} className="text-white font-semibold">{text.slice(start, end)}</span>);
      cursor = end;
    }
    if (cursor < text.length) parts.push(<span key={cursor}>{text.slice(cursor)}</span>);
    return parts;
  };

  // Color mapping
  const colors = {
    mint: { dot: 'bg-mint', ring: 'bg-mint/10', focus: 'rgba(73, 220, 122, 0.12)', glow: 'rgba(73, 220, 122, 0.06)' },
    orange: { dot: 'bg-accent-orange', ring: 'bg-accent-orange/10', focus: 'rgba(249, 115, 22, 0.12)', glow: 'rgba(249, 115, 22, 0.06)' },
  };
  const c = colors[iconColor] || colors.mint;

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={selected} />

      {/* Search Input */}
      <div className="relative group">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className="
            w-full rounded-2xl border-0 pl-10 pr-10 py-3.5 text-sm text-white
            placeholder-white/25 outline-none transition-all duration-300
            backdrop-blur-xl
          "
          style={{
            background: 'rgb(var(--surface-3) / 0.55)',
            boxShadow: open
              ? `0 0 24px ${c.glow}, 0 0 0 1px rgb(var(--glass-ink) / 0.10), inset 0 1px 0 rgb(var(--highlight-ink) / 0.05)`
              : 'inset 0 1px 0 rgb(var(--highlight-ink) / 0.03), 0 0 0 1px rgb(var(--glass-ink) / 0.08)',
          }}
        />

        {/* Left icon */}
        <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full ${c.ring} flex items-center justify-center transition-all duration-200`}>
          <div className={`w-2 h-2 rounded-full ${c.dot}`} />
        </div>

        {/* Right icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 transition-transform duration-200"
          style={{ transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          className="absolute z-50 mt-2 w-full rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
            background: 'rgb(var(--surface-2) / 0.95)',
            backdropFilter: 'blur(24px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
            boxShadow: `
              0 20px 60px rgb(var(--shadow-ink) / 0.18),
              0 0 0 1px rgb(var(--glass-ink) / 0.10),
              inset 0 1px 0 rgb(var(--highlight-ink) / 0.05)
            `,
          }}
        >
          {/* Search hint */}
          <div className="px-4 py-2 border-b border-white/[0.04] flex items-center gap-2">
            <Search className="w-3 h-3 text-white/20" />
            <span className="text-[10px] text-white/25 uppercase tracking-wider font-medium">
              {query.trim() ? `${results.length} resultado${results.length !== 1 ? 's' : ''}` : 'Cidades populares'}
            </span>
          </div>

          {/* Results list */}
          <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain py-1 custom-scrollbar">
            {results.map((city, i) => {
              const isHighlighted = i === highlightIndex;
              const [cityName, uf] = city.split(' - ');
              return (
                <button
                  key={city}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(city); }}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`
                    w-full text-left px-4 py-2.5 flex items-center gap-3 transition-all duration-100
                    ${isHighlighted
                      ? 'bg-white/[0.06]'
                      : 'hover:bg-white/[0.03]'
                    }
                  `}
                >
                  <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isHighlighted ? 'text-white/50' : 'text-white/15'}`} />
                  <span className={`text-sm truncate ${isHighlighted ? 'text-white/90' : 'text-white/50'}`}>
                    {highlightMatch(cityName)}
                  </span>
                  {uf && (
                    <span className={`
                      ml-auto text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md flex-shrink-0
                      ${isHighlighted
                        ? 'bg-white/[0.08] text-white/60'
                        : 'bg-white/[0.03] text-white/25'
                      }
                    `}>
                      {uf}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* No results */}
      {open && query.trim() && results.length === 0 && (
        <div
          className="absolute z-50 mt-2 w-full rounded-2xl px-4 py-6 text-center"
          style={{
            background: 'rgb(var(--surface-2) / 0.95)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 20px 60px rgb(var(--shadow-ink) / 0.18), 0 0 0 1px rgb(var(--glass-ink) / 0.10)',
          }}
        >
          <MapPin className="w-5 h-5 text-white/15 mx-auto mb-2" />
          <p className="text-xs text-white/30">Nenhuma cidade encontrada</p>
          <p className="text-[10px] text-white/15 mt-1">Tente buscar por nome ou UF</p>
        </div>
      )}
    </div>
  );
}
