import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MobilizationScenarioDetail } from './MobilizationScenarioDetail.jsx';

describe('MobilizationScenarioDetail', () => {
  it('renders real/computed labor time, percentages, final multiplier, rule and alerts', () => {
    const html = renderToStaticMarkup(
      React.createElement(MobilizationScenarioDetail, { scenario: {
        segments: [{
          id: 'derived-wait',
          source: 'derived',
          segmentType: 'waiting',
          departureAtUtc: '2026-01-07T21:00:00Z',
          arrivalAtUtc: '2026-01-07T22:00:00Z',
          originTimezone: 'UTC',
          destinationTimezone: 'UTC',
          durationMinutes: 60,
        }],
        laborByEmployee: [{
          employeeId: 'e1',
          employeeName: 'Ana',
          totalCostC: 18000,
          summary: { totalCountedMinutes: 120, weekdayOvertime50Minutes: 120 },
          alerts: [
            { code: 'daily_overtime_limit_exceeded', message: 'Mais de duas horas extras no dia.' },
            { code: 'daily_overtime_limit_exceeded', message: 'Mais de duas horas extras no dia.' },
            {
              code: 'automatic_eight_hour_interval_deduction',
              message: 'Intervalo de 1 hora abatido automaticamente para jornada completa de 8 horas.',
            },
            {
              code: 'automatic_eight_hour_interval_deduction',
              message: 'Intervalo de 1 hora abatido automaticamente para jornada completa de 8 horas.',
            },
            {
              code: 'continuous_multiday_journey',
              message: 'Jornada contínua atravessou mais de uma data sem reinício automático.',
            },
            {
              code: 'continuous_multiday_journey',
              message: 'Jornada contínua atravessou mais de uma data sem reinício automático.',
            },
          ],
          deductions: [{
            localDate: '2026-01-07',
            intervalSequence: 1,
            intervalType: 'meal_rest',
            realMinutes: 60,
            source: 'system',
          }],
          blocks: [{
            startAtUtc: '2026-01-07T22:00:00Z',
            endAtUtc: '2026-01-07T23:45:00Z',
            localTimezone: 'UTC',
            localDate: '2026-01-07',
            realMinutes: 105,
            computedMinutes: 120,
            baseClassification: 'overtime_50',
            overtimePercent: 50,
            nightPremiumPercent: 20,
            finalMultiplier: 1.8,
            ruleUsed: 'hora extra em dia útil',
            calculatedCostC: 18000,
          }],
        }],
      } })
    );

    expect(html).toContain('Gerado pelo sistema');
    expect(html).toContain('Tempo real');
    expect(html).toContain('Tempo computado');
    expect(html).toContain('1.80×');
    expect(html).toContain('+50%');
    expect(html).toContain('+20%');
    expect(html).toContain('hora extra em dia útil');
    expect(html.match(/Mais de duas horas extras no dia\./g)).toHaveLength(1);
    expect(html.match(/Intervalo de 1 hora abatido automaticamente para jornada completa de 8 horas\./g)).toHaveLength(1);
    expect(html.match(/Jornada contínua atravessou mais de uma data sem reinício automático\./g)).toHaveLength(1);
    expect(html).toContain('Intervalos abatidos pelo sistema');
    expect(html).toContain('Intervalo da jornada 1');
  });
});
