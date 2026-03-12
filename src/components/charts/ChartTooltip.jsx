export function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="glass-card p-4 !rounded-2xl text-xs min-w-[160px]">
      {label && <p className="text-white/35 mb-2 font-semibold uppercase tracking-wider text-[10px]">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-5 py-0.5">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-white/50">{entry.name}</span>
            </div>
            <span className="text-white font-semibold">
              {formatter ? formatter(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
