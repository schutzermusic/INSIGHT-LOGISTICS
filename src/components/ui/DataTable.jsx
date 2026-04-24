import { clsx } from 'clsx';

export function DataTable({ columns, data, className, onRowClick }) {
  return (
    <div className={clsx('surface-card glass-card p-0 overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={clsx(
                    'px-6 py-4 label-micro text-white/25 text-left',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={clsx(
                  'border-b border-white/[0.03] last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer',
                  'hover:bg-white/[0.02]'
                )}
                onClick={() => onRowClick?.(row, rowIdx)}
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className={clsx(
                      'px-6 py-4 text-sm tabular-data',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                    )}
                  >
                    {col.render ? col.render(row, rowIdx) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
