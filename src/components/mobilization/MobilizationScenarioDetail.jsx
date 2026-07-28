import React from 'react';
import { formatBRL } from '../../domain/money.js';
import { formatDuration, formatInTz } from '../../lib/datetime.js';

const SEGMENT_LABELS = {
  bus: 'Ônibus',
  flight: 'Voo',
  rental_car: 'Veículo locado',
  company_car: 'Veículo da frota',
  transfer: 'Transfer',
  local_transfer: 'Transfer',
  hotel_rest: 'Hotel / Descanso',
  disembarkation: 'Desembarque',
  baggage_claim: 'Retirada de bagagem',
  terminal_transfer: 'Transfer entre terminais',
  waiting: 'Espera residual',
  check_in_boarding: 'Check-in / antecedência de embarque',
};

export function MobilizationScenarioDetail({ scenario }) {
  if (!scenario) return null;
  return (
    <div className="space-y-4">
      <ScenarioTimeline segments={scenario.segments || []} />
      <AllowanceBreakdown allowance={scenario.mealAllowance} />
      <LaborBreakdown laborByEmployee={scenario.laborByEmployee || []} />
    </div>
  );
}

function ScenarioTimeline({ segments }) {
  return (
    <section className="surface-recessed rounded-xl p-4 border border-white/10">
      <h3 className="text-[13px] font-semibold text-white/85 mb-3">Timeline operacional confirmada</h3>
      <div className="space-y-2">
        {segments.map((segment) => {
          const derived = segment.source === 'derived';
          const label = SEGMENT_LABELS[segment.segmentType] ||
            SEGMENT_LABELS[segment.mode] ||
            segment.segmentType ||
            segment.mode;
          return (
            <div key={segment.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${derived ? 'bg-info-bg/50 border border-info-border/20' : 'bg-white/[0.025]'}`}>
              <span className={`w-2 h-2 rounded-full ${derived ? 'bg-info-text' : 'bg-white/30'}`} />
              <div className="flex-1 min-w-0">
                <span className="text-[12px] text-white/75">{label}</span>
                {derived && <span className="ml-2 label-micro text-info-text">Gerado pelo sistema</span>}
                <span className="block label-micro text-white/35">
                  {formatInTz(segment.departureAtUtc, segment.originTimezone)}
                  {' → '}
                  {formatInTz(segment.arrivalAtUtc, segment.destinationTimezone)}
                </span>
              </div>
              <span className="label-micro text-white/45">{formatDuration(segment.durationMinutes || 0)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AllowanceBreakdown({ allowance }) {
  if (!allowance?.byEmployee?.length) return null;
  return (
    <section className="surface-recessed rounded-xl p-4 border border-white/10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-[13px] font-semibold text-white/85">Diárias de alimentação por colaborador</h3>
        <span className="label-micro text-white/40">Política v{allowance.policy?.version}</span>
      </div>
      <div className="space-y-3">
        {allowance.byEmployee.map((employee) => (
          <div key={employee.employeeId} className="rounded-lg border border-white/[0.06] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-white/[0.025]">
              <span className="text-[12px] text-white/75">
                {employee.employeeName} · {employee.category === 'leader' ? 'Liderança' : 'Padrão'}
              </span>
              <strong className="text-[12px] text-mint">
                {Number(employee.quantity || 0).toLocaleString('pt-BR')} diária(s) · {formatBRL(employee.totalC)}
              </strong>
            </div>
            {(employee.lines || []).map((line) => (
              <div key={line.eligibleDate} className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-white/[0.05] label-micro text-white/45">
                <span>{line.eligibleDate}</span>
                <span className="text-right">Qtd. {Number(line.quantity || 0).toLocaleString('pt-BR')}</span>
                <span className="text-right">{formatBRL(line.unitValueC)}</span>
                <span className="text-right text-white/65">{formatBRL(line.totalC)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function LaborBreakdown({ laborByEmployee }) {
  return laborByEmployee.map((employee) => {
    const summary = employee.summary || {};
    const blocks = employee.blocks || [];
    const visibleAlerts = deduplicateLaborAlerts(employee.alerts || []);
    const realMinutes = blocks.reduce((sum, block) => sum + (block.realMinutes || 0), 0);
    return (
      <section key={employee.employeeId} className="surface-recessed rounded-xl p-4 border border-white/10">
        <div className="flex justify-between gap-3 mb-3">
          <div>
            <strong className="text-white/85">{employee.employeeName}</strong>
            <span className="block label-micro text-white/35 mt-1">
              {formatDuration(realMinutes)} reais · {formatDuration(summary.totalCountedMinutes || 0)} computadas
            </span>
          </div>
          <strong className="text-mint">{formatBRL(employee.totalCostC)}</strong>
        </div>
        {employee.warning ? (
          <p className="text-[12px] text-warning-text">Sem custo-hora válido.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Hora normal útil" value={formatDuration(summary.regularMinutes || 0)} />
            <Row label="HE 50% útil" value={formatDuration(summary.weekdayOvertime50Minutes || 0)} />
            <Row label="HE 100% útil" value={formatDuration(summary.weekdayOvertime100Minutes || 0)} />
            <Row label="Sábado 100%" value={formatDuration(summary.saturdayOvertime100Minutes || 0)} />
            <Row label="Domingo 2,5×" value={formatDuration(summary.sundayPremium150Minutes || 0)} />
            <Row label="Adicional noturno" value={formatDuration(summary.nightPremiumMinutes || 0)} />
          </div>
        )}
        {visibleAlerts.length > 0 && (
          <div className="mt-3 space-y-1.5" role="status">
            {visibleAlerts.map((alert, index) => (
              <p
                key={`${alert.code}-${index}`}
                className="rounded-lg border border-warning-border/30 bg-warning-bg/60 px-3 py-2 text-[12px] text-warning-text"
              >
                {alert.message}
              </p>
            ))}
          </div>
        )}
        {!!employee.deductions?.length && (
          <div className="mt-3 rounded-lg border border-info-border/25 bg-info-bg/40 px-3 py-2">
            <span className="label-micro text-info-text">Intervalos abatidos pelo sistema</span>
            <div className="mt-1.5 space-y-1">
              {employee.deductions.map((deduction, index) => (
                <p
                  key={`${deduction.localDate}-${deduction.intervalSequence || index}-${index}`}
                  className="text-[12px] text-white/55"
                >
                  {deduction.localDate} · Intervalo da jornada
                  {deduction.intervalSequence ? ` ${deduction.intervalSequence}` : ''}
                  {' · '}{formatDuration(deduction.realMinutes || 0)}
                  <span className="ml-2 label-micro text-info-text">Gerado pelo sistema</span>
                </p>
              ))}
            </div>
          </div>
        )}
        {!employee.warning && blocks.length > 0 && <LaborBlockTable blocks={blocks} />}
      </section>
    );
  });
}

const SINGLE_LABOR_ALERTS = [
  {
    code: 'automatic_eight_hour_interval_deduction',
    messagePrefix: 'Intervalo de 1 hora abatido automaticamente para jornada completa de 8 horas',
  },
  {
    code: 'daily_overtime_limit_exceeded',
    messagePrefix: 'Mais de duas horas extras no dia',
  },
  {
    code: 'continuous_multiday_journey',
    messagePrefix: 'Jornada contínua atravessou mais de uma data sem reinício automático',
  },
];

function deduplicateLaborAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const message = String(alert.message || '');
    const repeatedType = SINGLE_LABOR_ALERTS.find(
      (type) => alert.code === type.code || message.startsWith(type.messagePrefix),
    );
    if (!repeatedType) return true;
    if (seen.has(repeatedType.code)) return false;
    seen.add(repeatedType.code);
    return true;
  });
}

const LABOR_CLASS_LABELS = {
  regular: 'Normal',
  overtime_50: 'Hora extra +50%',
  overtime_100: 'Hora extra +100%',
  overtime_150: 'Domingo/feriado +150%',
};

function LaborBlockTable({ blocks }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-white/[0.07]">
      <table className="w-full min-w-[1040px] text-left">
        <thead className="bg-white/[0.035]">
          <tr>
            {[
              'Data local', 'Início–fim', 'Tempo real', 'Tempo computado',
              'Faixa', 'HE', 'Noturno', 'Multiplicador', 'Regra', 'Valor',
            ].map((label) => (
              <th key={label} className="px-3 py-2 label-micro text-white/40">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocks.map((block, index) => (
            <tr key={`${block.startAtUtc}-${index}`} className="border-t border-white/[0.05]">
              <td className="px-3 py-2 text-[11px] text-white/55 tabular-data">{block.localDate}</td>
              <td className="px-3 py-2 text-[11px] text-white/55 tabular-data">
                {localTime(block.startAtUtc, block.localTimezone)}
                {'–'}
                {localTime(block.endAtUtc, block.localTimezone)}
              </td>
              <td className="px-3 py-2 text-[11px] text-white/55 tabular-data">{formatDuration(block.realMinutes || 0)}</td>
              <td className="px-3 py-2 text-[11px] text-white/75 tabular-data">{formatComputedMinutes(block.computedMinutes)}</td>
              <td className="px-3 py-2 text-[11px] text-white/70">{LABOR_CLASS_LABELS[block.baseClassification] || block.baseClassification}</td>
              <td className="px-3 py-2 text-[11px] text-white/55 tabular-data">+{block.overtimePercent || 0}%</td>
              <td className="px-3 py-2 text-[11px] text-white/55 tabular-data">+{block.nightPremiumPercent || 0}%</td>
              <td className="px-3 py-2 text-[11px] text-mint tabular-data">{Number(block.finalMultiplier || 1).toFixed(2)}×</td>
              <td className="px-3 py-2 text-[11px] text-white/55">{block.ruleUsed}</td>
              <td className="px-3 py-2 text-[11px] text-white/80 tabular-data">{formatBRL(block.calculatedCostC || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function localTime(iso, timeZone) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timeZone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso?.slice(11, 16) || '—';
  }
}

function formatComputedMinutes(minutes = 0) {
  const rounded = Math.round(Number(minutes) || 0);
  const formatted = formatDuration(rounded);
  return Math.abs(rounded - Number(minutes || 0)) >= 0.01
    ? `${formatted} (${Number(minutes).toFixed(2)} min)`
    : formatted;
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-white/50">{label}</span>
      <span className="tabular-data text-white/75">{value}</span>
    </div>
  );
}
