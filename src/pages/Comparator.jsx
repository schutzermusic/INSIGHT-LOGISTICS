import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, Bus, Car, Check,
  CheckCircle, ChevronDown, ChevronUp, Clock, Copy, Gauge, Hotel, Info,
  Loader2, Plane, Plus, Route as RouteIcon, Search, Shield, ShieldCheck,
  Trash2, Truck, Users, Utensils, X,
} from 'lucide-react';
import { useCollaborators } from '../hooks/useStore';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { CityAutocomplete } from '../components/ui/CityAutocomplete';
import { DatePicker } from '../components/ui/DatePicker';
import { ConfirmMobilizationModal } from '../components/mobilization/ConfirmMobilizationModal';
import { getExtendedCities } from '../engine/routes-intelligence-db';
import { formatBRL, toCentavos } from '../domain/money';
import { mobilizationDraftHistorySummary } from '../domain/mobilizationDraftSummary';
import { formatDuration, formatInTz, zonedLocalToUtcIso } from '../lib/datetime';
import { mobilizationManualCalculate } from '../services/BackendApiClient';
import { deleteSimulation, saveSimulation } from '../data/store';

const DEFAULT_TZ = 'America/Sao_Paulo';
const PAID_TYPES = new Set(['bus', 'flight', 'rental_car', 'company_car', 'transfer', 'hotel_rest', 'meal_break']);
const TRAVEL_TYPES = new Set(['bus', 'flight', 'rental_car', 'company_car', 'transfer']);
const SEGMENT_TYPES = [
  { key: 'bus', label: 'Ônibus', icon: Bus, originType: 'bus_terminal', destType: 'bus_terminal', allocation: 'per_person' },
  { key: 'flight', label: 'Voo', icon: Plane, originType: 'airport', destType: 'airport', allocation: 'per_person' },
  { key: 'rental_car', label: 'Veículo locado', icon: Car, originType: 'city', destType: 'city', allocation: 'selected_passengers_total' },
  { key: 'company_car', label: 'Veículo da frota', icon: Truck, originType: 'city', destType: 'city', allocation: 'selected_passengers_total' },
  { key: 'transfer', label: 'Transfer', icon: ArrowLeftRight, originType: 'custom', destType: 'custom', allocation: 'selected_passengers_total' },
  { key: 'waiting', label: 'Espera / Conexão', icon: Clock, originType: 'custom', destType: 'custom', allocation: 'none' },
  { key: 'hotel_rest', label: 'Hotel / Descanso', icon: Hotel, originType: 'hotel', destType: 'hotel', allocation: 'selected_passengers_total' },
  { key: 'meal_break', label: 'Alimentação', icon: Utensils, originType: 'custom', destType: 'custom', allocation: 'per_person' },
];
const TYPE_META = Object.fromEntries(SEGMENT_TYPES.map((type) => [type.key, type]));
const LOCATION_TYPES = [
  ['city', 'Cidade'], ['airport', 'Aeroporto'], ['bus_terminal', 'Rodoviária'],
  ['company_base', 'Base da empresa'], ['site', 'Obra / local de trabalho'],
  ['hotel', 'Hotel'], ['custom', 'Ponto operacional'],
];
const PRICE_ALLOCATIONS = [
  ['per_person', 'Por colaborador'],
  ['selected_passengers_total', 'Total para os selecionados'],
];

let sequence = 0;
const newId = (prefix) => `${prefix}-${Date.now()}-${sequence++}`;
const datePart = (value) => value?.slice(0, 10) || '';
const timePart = (value) => value?.slice(11, 16) || '';
const localValue = (date, time) => (date && time ? `${date}T${time}` : '');
const addMinutesToLocal = (local, minutes) => {
  if (!local || !Number.isFinite(minutes)) return '';
  const [date, time] = local.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) + minutes * 60000)
    .toISOString()
    .slice(0, 16);
};
const employeeName = (employee) => employee.nome || employee.name || 'Colaborador';
const employeeRole = (employee) => employee.cargo || employee.role || 'Cargo não informado';
const hourlyRateC = (employee) => (
  employee.hourlyRateC ??
  (employee.salarioBase && employee.cargaHoraria
    ? Math.round((employee.salarioBase / employee.cargaHoraria) * 100)
    : 0)
);

function blankSegment(type, direction, date, previous) {
  const meta = TYPE_META[type];
  const previousArrival = previous?.arrivalLocal || '';
  const defaultOrigin = previous?.destinationLocationId || '';
  return {
    id: newId('seg'),
    segmentType: type,
    direction,
    originLocationId: defaultOrigin,
    destinationLocationId: type === 'waiting' ? defaultOrigin : '',
    originLocationType: previous?.destinationLocationType || meta.originType,
    destinationLocationType: meta.destType,
    departureDate: datePart(previousArrival) || date || '',
    departureTime: '',
    arrivalDate: datePart(previousArrival) || date || '',
    arrivalTime: '',
    departureTz: DEFAULT_TZ,
    arrivalTz: DEFAULT_TZ,
    connectionDate: type === 'waiting' ? (datePart(previousArrival) || date || '') : '',
    connectionHours: '',
    priceAmount: type === 'waiting' ? '0' : '',
    priceAllocation: type === 'waiting' ? 'none' : meta.allocation,
    providerName: '',
    serviceClass: '',
    flightNumber: '',
    quoteReference: '',
    baggageDescription: '',
    baggageFee: '',
    taxesAmount: '',
    boardingLeadMinutes: type === 'flight' ? '120' : type === 'bus' ? '30' : '',
    disembarkMinutes: '',
    baggageClaimMinutes: '',
    driverName: '',
    vehicleCategory: '',
    vehicleReference: '',
    rentalDays: '',
    distanceKm: '',
    fuelConsumptionKmL: '',
    fuelPricePerLiter: '',
    tollsAmount: '',
    parkingAmount: '',
    oneWayFee: '',
    extraMileageAmount: '',
    otherChargesAmount: '',
    transferType: '',
    safetyMarginMinutes: '',
    hotelName: '',
    roomCount: '',
    roomOccupancy: '',
    mealsIncluded: '',
    mealDescription: '',
    notes: '',
    passengerIds: null,
    countsAsLabor: type === 'hotel_rest' || type === 'meal_break' ? false : undefined,
    qualifiesAsRest: type === 'hotel_rest',
  };
}

function segmentCommercialAmount(segment) {
  const base = Number(segment.priceAmount || 0);
  const directExtras = [
    segment.baggageFee,
    segment.taxesAmount,
    segment.tollsAmount,
    segment.parkingAmount,
    segment.oneWayFee,
    segment.extraMileageAmount,
    segment.otherChargesAmount,
  ].reduce((sum, value) => sum + Number(value || 0), 0);
  const distance = Number(segment.distanceKm || 0);
  const consumption = Number(segment.fuelConsumptionKmL || 0);
  const literPrice = Number(segment.fuelPricePerLiter || 0);
  const fuel = distance > 0 && consumption > 0 && literPrice > 0
    ? (distance / consumption) * literPrice
    : 0;
  return Math.max(0, base + directExtras + fuel);
}

function validateSegment(segment, selectedIds) {
  const errors = [];
  if (segment.segmentType === 'waiting') {
    if (!segment.originLocationId.trim()) errors.push('Informe a cidade da conexão.');
    if (!segment.connectionDate) errors.push('Informe a data da conexão.');
    if (!(Number(segment.connectionHours) > 0)) errors.push('Informe a duração da conexão em horas.');
    const passengers = segment.passengerIds || selectedIds;
    if (!passengers.length) errors.push('Selecione ao menos um colaborador para a simulação.');
    return errors;
  }
  if (!segment.originLocationId.trim()) errors.push('Informe a origem.');
  if (!segment.destinationLocationId.trim()) errors.push('Informe o destino.');
  if (!segment.departureDate || !segment.departureTime) errors.push('Informe a data e hora de saída.');
  if (!segment.arrivalDate || !segment.arrivalTime) errors.push('Informe a data e hora de chegada.');
  const departure = localValue(segment.departureDate, segment.departureTime);
  const arrival = localValue(segment.arrivalDate, segment.arrivalTime);
  if (departure && arrival && Date.parse(arrival) <= Date.parse(departure)) {
    errors.push('A chegada deve ser posterior à saída.');
  }
  if (PAID_TYPES.has(segment.segmentType) && (segment.priceAmount === '' || Number(segment.priceAmount) < 0)) {
    errors.push('Informe um preço manual válido.');
  }
  const passengers = segment.passengerIds || selectedIds;
  if (!passengers.length) errors.push('Vincule ao menos um colaborador.');
  if (segment.segmentType === 'bus' && !segment.providerName.trim()) {
    errors.push('Informe a empresa de ônibus.');
  }
  if (segment.segmentType === 'flight' && !segment.providerName.trim()) {
    errors.push('Informe a companhia aérea.');
  }
  if (segment.segmentType === 'rental_car' && !segment.driverName.trim()) {
    errors.push('Informe o condutor do veículo locado.');
  }
  if (segment.segmentType === 'hotel_rest') {
    if (!segment.hotelName.trim()) errors.push('Informe o hotel ou local de descanso.');
  }
  return errors;
}

function segmentDuration(segment) {
  if (segment.segmentType === 'waiting') {
    const minutes = Math.round(Number(segment.connectionHours) * 60);
    return minutes > 0 ? minutes : null;
  }
  const start = localValue(segment.departureDate, segment.departureTime);
  const end = localValue(segment.arrivalDate, segment.arrivalTime);
  if (!start || !end) return null;
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
  return minutes > 0 ? minutes : null;
}

function scenarioIsComplete(scenario, selectedIds, tripType) {
  const outbound = scenario.outbound || [];
  const inbound = scenario.return || [];
  if (!outbound.length || (tripType === 'roundtrip' && !inbound.length)) return false;
  return [...outbound, ...(tripType === 'roundtrip' ? inbound : [])]
    .every((segment) => validateSegment(segment, selectedIds).length === 0);
}

export default function Comparator() {
  const { collaborators } = useCollaborators();
  const navigate = useNavigate();
  const location = useLocation();
  const cities = useMemo(() => getExtendedCities(), []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [ctx, setCtx] = useState({
    name: '', origin: '', destination: '', tripType: 'oneway',
    outboundDate: '', returnDate: '',
  });
  const [scenarios, setScenarios] = useState([
    { id: newId('scenario'), name: 'Cenário A', outbound: [], return: [] },
  ]);
  const [activeDirection, setActiveDirection] = useState({});
  const [openSegmentId, setOpenSegmentId] = useState(null);
  const [result, setResult] = useState(null);
  const [calculationState, setCalculationState] = useState('pending');
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [draftContext, setDraftContext] = useState({});
  const [activeDraftId, setActiveDraftId] = useState(null);
  const requestVersion = useRef(0);
  const restoredDraft = useRef(false);

  useEffect(() => {
    if (restoredDraft.current || !collaborators.length) return;
    const draft = location.state?.mobilizationDraft;
    const editor = draft?.editorState;
    if (!draft || draft.type !== 'mobilization-draft' || !editor) return;
    restoredDraft.current = true;
    setCtx(editor.ctx || {});
    setSelectedIds((editor.selectedIds || []).filter((id) => collaborators.some((employee) => employee.id === id)));
    setScenarios(Array.isArray(editor.scenarios) && editor.scenarios.length
      ? editor.scenarios
      : [{ id: newId('scenario'), name: 'Cenário A', outbound: [], return: [] }]);
    setResult(draft.calculationResult || null);
    setCalculationState(draft.calculationResult ? 'calculated' : 'pending');
    setDraftContext(draft.confirmationContext || {});
    setActiveDraftId(draft.id || null);
    setConfirmOpen(location.state?.draftIntent === 'confirm' && !!draft.calculationResult?.recommended);
    navigate(location.pathname, { replace: true, state: null });
  }, [collaborators, location.pathname, location.state, navigate]);

  const selectedEmployees = useMemo(
    () => collaborators.filter((employee) => selectedIds.includes(employee.id)),
    [collaborators, selectedIds],
  );
  const normalizedQuery = employeeQuery.trim().toLocaleLowerCase('pt-BR');
  const visibleEmployees = useMemo(() => collaborators.filter((employee) => {
    if (!normalizedQuery) return true;
    return [
      employeeName(employee), employeeRole(employee), employee.matricula,
      employee.projeto || employee.project, employee.cidadeAtual || employee.cidade || employee.city,
    ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(normalizedQuery);
  }), [collaborators, normalizedQuery]);

  const allComplete = selectedIds.length > 0 && ctx.origin && ctx.destination && ctx.outboundDate &&
    (ctx.tripType === 'oneway' || ctx.returnDate) &&
    scenarios.length > 0 &&
    scenarios.every((scenario) => scenarioIsComplete(scenario, selectedIds, ctx.tripType));

  const toggleEmployee = (id) => {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
    setResult(null);
    setCalculationState('pending');
  };

  const updateScenario = useCallback((scenarioId, updater) => {
    setScenarios((current) => current.map((scenario) => (
      scenario.id === scenarioId ? updater(scenario) : scenario
    )));
    setResult(null);
    setCalculationState('pending');
  }, []);

  const addScenario = () => {
    setScenarios((current) => [...current, {
      id: newId('scenario'),
      name: `Cenário ${String.fromCharCode(65 + current.length)}`,
      outbound: [],
      return: [],
    }]);
    setCalculationState('pending');
  };

  const duplicateScenario = (scenarioId) => {
    const source = scenarios.find((scenario) => scenario.id === scenarioId);
    if (!source) return;
    const clone = {
      ...source,
      id: newId('scenario'),
      name: `${source.name} (cópia)`,
      outbound: source.outbound.map((segment) => ({ ...segment, id: newId('seg') })),
      return: source.return.map((segment) => ({ ...segment, id: newId('seg') })),
    };
    setScenarios((current) => [...current, clone]);
    setCalculationState('pending');
  };

  const removeScenario = (scenarioId) => {
    setScenarios((current) => current.length > 1
      ? current.filter((scenario) => scenario.id !== scenarioId)
      : current);
    setCalculationState('pending');
  };

  const addSegment = (scenarioId, direction, type) => {
    updateScenario(scenarioId, (scenario) => {
      const timeline = scenario[direction] || [];
      const date = direction === 'outbound' ? ctx.outboundDate : ctx.returnDate;
      const segment = blankSegment(type, direction, date, timeline.at(-1));
      setOpenSegmentId(segment.id);
      return { ...scenario, [direction]: [...timeline, segment] };
    });
  };

  const updateSegment = (scenarioId, direction, segmentId, patch) => {
    updateScenario(scenarioId, (scenario) => ({
      ...scenario,
      [direction]: scenario[direction].map((segment) => (
        segment.id === segmentId ? { ...segment, ...patch } : segment
      )),
    }));
  };

  const duplicateSegment = (scenarioId, direction, segmentId) => {
    updateScenario(scenarioId, (scenario) => {
      const index = scenario[direction].findIndex((segment) => segment.id === segmentId);
      if (index < 0) return scenario;
      const copy = { ...scenario[direction][index], id: newId('seg') };
      const timeline = [...scenario[direction]];
      timeline.splice(index + 1, 0, copy);
      setOpenSegmentId(copy.id);
      return { ...scenario, [direction]: timeline };
    });
  };

  const removeSegment = (scenarioId, direction, segmentId) => {
    updateScenario(scenarioId, (scenario) => ({
      ...scenario,
      [direction]: scenario[direction].filter((segment) => segment.id !== segmentId),
    }));
    if (openSegmentId === segmentId) setOpenSegmentId(null);
  };

  const moveSegment = (scenarioId, direction, segmentId, offset) => {
    updateScenario(scenarioId, (scenario) => {
      const timeline = [...scenario[direction]];
      const index = timeline.findIndex((segment) => segment.id === segmentId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= timeline.length) return scenario;
      [timeline[index], timeline[target]] = [timeline[target], timeline[index]];
      return { ...scenario, [direction]: timeline };
    });
  };

  const copyOutboundToReturn = (scenarioId) => {
    updateScenario(scenarioId, (scenario) => {
      const copied = [...scenario.outbound].reverse().map((segment) => ({
        ...segment,
        id: newId('seg'),
        direction: 'return',
        originLocationId: segment.destinationLocationId,
        destinationLocationId: segment.originLocationId,
        originLocationType: segment.destinationLocationType,
        destinationLocationType: segment.originLocationType,
        departureDate: ctx.returnDate,
        departureTime: '',
        arrivalDate: ctx.returnDate,
        arrivalTime: '',
      }));
      if (copied[0]) setOpenSegmentId(copied[0].id);
      return { ...scenario, return: copied };
    });
  };

  const toApiSegment = useCallback((segment, passengerIds, sequenceIndex, bounds = {}) => {
    const departureLocal = bounds.departureLocal || localValue(segment.departureDate, segment.departureTime);
    const arrivalLocal = bounds.arrivalLocal || localValue(segment.arrivalDate, segment.arrivalTime);
    const departureAtUtc = zonedLocalToUtcIso(departureLocal, segment.departureTz);
    const arrivalAtUtc = zonedLocalToUtcIso(arrivalLocal, segment.arrivalTz);
    return {
      id: segment.id,
      sequence: sequenceIndex,
      segmentType: segment.segmentType,
      direction: segment.direction,
      originLocationId: segment.originLocationId,
      destinationLocationId: segment.segmentType === 'waiting'
        ? segment.originLocationId
        : segment.destinationLocationId,
      originLocationType: segment.segmentType === 'waiting' ? 'city' : segment.originLocationType,
      destinationLocationType: segment.segmentType === 'waiting' ? 'city' : segment.destinationLocationType,
      departureAtUtc,
      arrivalAtUtc,
      originTimezone: segment.departureTz,
      destinationTimezone: segment.arrivalTz,
      releaseAtUtc: segment.segmentType === 'hotel_rest' ? departureAtUtc : null,
      providerName: segment.providerName || null,
      priceAmountMinor: toCentavos(
        segment.segmentType === 'waiting' ? 0 : segmentCommercialAmount(segment),
      ),
      priceAllocation: segment.segmentType === 'waiting' ? 'none' : segment.priceAllocation,
      currency: 'BRL',
      passengerIds: segment.passengerIds || passengerIds,
      countsAsLabor: segment.countsAsLabor,
      qualifiesAsRest: segment.qualifiesAsRest,
      metadata: {
        direction: segment.direction,
        notes: segment.notes || null,
        serviceClass: segment.serviceClass || null,
        flightNumber: segment.flightNumber || null,
        quoteReference: segment.quoteReference || null,
        baggageDescription: segment.baggageDescription || null,
        boardingLeadMinutes: Number(segment.boardingLeadMinutes || 0),
        disembarkMinutes: Number(segment.disembarkMinutes || 0),
        baggageClaimMinutes: Number(segment.baggageClaimMinutes || 0),
        driverName: segment.driverName || null,
        vehicleCategory: segment.vehicleCategory || null,
        vehicleReference: segment.vehicleReference || null,
        rentalDays: Number(segment.rentalDays || 0),
        distanceKm: Number(segment.distanceKm || 0),
        fuelConsumptionKmL: Number(segment.fuelConsumptionKmL || 0),
        fuelPricePerLiter: Number(segment.fuelPricePerLiter || 0),
        tollsAmountMinor: toCentavos(Number(segment.tollsAmount || 0)),
        parkingAmountMinor: toCentavos(Number(segment.parkingAmount || 0)),
        oneWayFeeMinor: toCentavos(Number(segment.oneWayFee || 0)),
        extraMileageAmountMinor: toCentavos(Number(segment.extraMileageAmount || 0)),
        otherChargesAmountMinor: toCentavos(Number(segment.otherChargesAmount || 0)),
        transferType: segment.transferType || null,
        safetyMarginMinutes: Number(segment.safetyMarginMinutes || 0),
        hotelName: segment.hotelName || null,
        roomCount: Number(segment.roomCount || 0),
        roomOccupancy: Number(segment.roomOccupancy || 0),
        mealsIncluded: segment.mealsIncluded || null,
        mealDescription: segment.mealDescription || null,
        restEndAtUtc: segment.segmentType === 'hotel_rest' ? arrivalAtUtc : null,
      },
    };
  }, []);

  const buildPayload = useCallback(() => {
    const employeeIds = selectedEmployees.map((employee) => employee.id);
    return {
      simulation: {
        name: ctx.name || 'Simulação manual',
        origin: ctx.origin,
        destination: ctx.destination,
        tripType: ctx.tripType,
        outboundDate: ctx.outboundDate,
        returnDate: ctx.tripType === 'roundtrip' ? ctx.returnDate : null,
      },
      employees: selectedEmployees.map((employee) => ({
        id: employee.id,
        nome: employeeName(employee),
        cargo: employeeRole(employee),
        hourlyRateC: hourlyRateC(employee),
        salarioBase: employee.salarioBase,
        cargaHoraria: employee.cargaHoraria,
        priorWorkedMinutes: employee.priorWorkedMinutes || 0,
        workedMinutesSource: employee.workedMinutesSource || 'cadastro',
      })),
      scenarios: scenarios.map((scenario) => {
        const raw = [
          ...scenario.outbound.map((segment) => ({ ...segment, direction: 'outbound' })),
          ...(ctx.tripType === 'roundtrip'
            ? scenario.return.map((segment) => ({ ...segment, direction: 'return' }))
            : []),
        ];
        let previousArrivalLocal = '';
        const normalizedSegments = raw.map((segment, index) => {
          let departureLocal = localValue(segment.departureDate, segment.departureTime);
          let arrivalLocal = localValue(segment.arrivalDate, segment.arrivalTime);
          if (segment.segmentType === 'waiting') {
            const previousTime = datePart(previousArrivalLocal) === segment.connectionDate
              ? timePart(previousArrivalLocal)
              : '00:00';
            departureLocal = localValue(segment.connectionDate, previousTime);
            arrivalLocal = addMinutesToLocal(
              departureLocal,
              Math.round(Number(segment.connectionHours) * 60),
            );
          }
          const normalized = toApiSegment(
            segment,
            employeeIds,
            index,
            { departureLocal, arrivalLocal },
          );
          previousArrivalLocal = arrivalLocal;
          return normalized;
        });
        return {
          id: scenario.id,
          name: scenario.name,
          tripType: ctx.tripType,
          segments: normalizedSegments,
        };
      }),
    };
  }, [ctx, scenarios, selectedEmployees, toApiSegment]);

  const saveAsDraft = useCallback(async (confirmationContext) => {
    const recommended = result?.recommended;
    const saved = await saveSimulation({
      type: 'mobilization-draft',
      status: 'draft',
      nome: ctx.name || recommended?.scenarioName || 'Mobilização em rascunho',
      origem: ctx.origin,
      destino: ctx.destination,
      modal: recommended?.modeSequence?.join(' + ') || 'Multimodal',
      qtdColaboradores: selectedIds.length,
      resumo: mobilizationDraftHistorySummary(recommended),
      editorState: { ctx, selectedIds, scenarios },
      calculationResult: result,
      confirmationContext,
      savedAt: new Date().toISOString(),
    });
    if (!saved) throw new Error('Não foi possível persistir o rascunho.');
    if (activeDraftId && activeDraftId !== saved.id) await deleteSimulation(activeDraftId);
    setActiveDraftId(saved.id);
    setDraftContext(confirmationContext);
    return saved;
  }, [activeDraftId, ctx, result, scenarios, selectedIds]);

  const calculate = useCallback(async ({ automatic = false } = {}) => {
    if (!allComplete) {
      setCalculationState('pending');
      if (!automatic) setError('Preencha os horários, preços e passageiros obrigatórios de todos os trechos.');
      return;
    }
    const version = ++requestVersion.current;
    setCalculationState('calculating');
    setError('');
    try {
      const response = await mobilizationManualCalculate(buildPayload());
      if (version !== requestVersion.current) return;
      setResult(response);
      setCalculationState('calculated');
    } catch (exception) {
      if (version !== requestVersion.current) return;
      setError(exception.message || 'Falha ao calcular a simulação.');
      setCalculationState('pending');
    }
  }, [allComplete, buildPayload]);

  useEffect(() => {
    if (!allComplete) return undefined;
    const timer = window.setTimeout(() => calculate({ automatic: true }), 650);
    return () => window.clearTimeout(timer);
  }, [allComplete, calculate]);

  if (!collaborators.length) {
    return (
      <div className="space-y-6">
        <PageHero />
        <EmptyState
          icon={AlertTriangle}
          title="Cadastre colaboradores primeiro"
          description="A simulação começa pela seleção da equipe. Cadastre ao menos um colaborador."
        >
          <button className="btn-primary-mint" onClick={() => navigate('/colaboradores')}>Ir para Cadastro</button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero teamCount={selectedIds.length} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] gap-6 items-stretch">
        <CommonParameters ctx={ctx} setCtx={(patch) => {
          setCtx((current) => ({ ...current, ...patch }));
          setResult(null);
          setCalculationState('pending');
        }} cities={cities} />
        <TeamSelector
          employees={visibleEmployees}
          selectedEmployees={selectedEmployees}
          selectedIds={selectedIds}
          query={employeeQuery}
          onQuery={setEmployeeQuery}
          onToggle={toggleEmployee}
          onSelectVisible={() => setSelectedIds((current) => [
            ...new Set([...current, ...visibleEmployees.map((employee) => employee.id)]),
          ])}
          onClear={() => setSelectedIds([])}
        />
      </div>

      <PolicyPanel policy={result?.policySummary} />

      <section className="manual-workspace surface-card relative overflow-hidden">
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <SectionTitle
              icon={Gauge}
              title="Cenários"
              subtitle="Trechos editáveis com cálculo automático de duração, conexões, jornada e custos."
            />
            <button className="manual-primary-action" onClick={addScenario}>
              <Plus className="w-4 h-4" /> Novo cenário
            </button>
          </div>

          <div className="space-y-5">
            {scenarios.map((scenario) => (
              <ScenarioEditor
                key={scenario.id}
                scenario={scenario}
                tripType={ctx.tripType}
                direction={activeDirection[scenario.id] || 'outbound'}
                onDirection={(direction) => setActiveDirection((current) => ({ ...current, [scenario.id]: direction }))}
                selectedIds={selectedIds}
                employees={selectedEmployees}
                cities={cities}
                openSegmentId={openSegmentId}
                onToggleOpen={(id) => setOpenSegmentId((current) => current === id ? null : id)}
                onRename={(name) => updateScenario(scenario.id, (current) => ({ ...current, name }))}
                onDuplicate={() => duplicateScenario(scenario.id)}
                onRemove={() => removeScenario(scenario.id)}
                onAddSegment={(direction, type) => addSegment(scenario.id, direction, type)}
                onUpdateSegment={(direction, segmentId, patch) => updateSegment(scenario.id, direction, segmentId, patch)}
                onDuplicateSegment={(direction, segmentId) => duplicateSegment(scenario.id, direction, segmentId)}
                onRemoveSegment={(direction, segmentId) => removeSegment(scenario.id, direction, segmentId)}
                onMoveSegment={(direction, segmentId, offset) => moveSegment(scenario.id, direction, segmentId, offset)}
                onCopyOutbound={() => copyOutboundToReturn(scenario.id)}
                result={result?.scenarios?.find((item) => item.scenarioId === scenario.id)}
              />
            ))}
          </div>
        </div>
      </section>

      <CalculationFooter
        state={calculationState}
        complete={allComplete}
        error={error}
        onCalculate={() => calculate()}
      />

      {result && <Results result={result} onOpenDrawer={setDrawer} />}
      {drawer && <LaborDrawer result={result} drawer={drawer} onClose={() => setDrawer(null)} />}

      {result?.recommended && (
        <ConfirmationGate
          confirmed={confirmed}
          scenario={result.recommended}
          onOpen={() => setConfirmOpen(true)}
        />
      )}

      {result?.recommended && (
        <ConfirmMobilizationModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          source="manual_simulation"
          scenario={result.recommended}
          alternatives={result.scenarios}
          employees={selectedEmployees.map((employee) => ({
            id: employee.id, name: employeeName(employee), role: employeeRole(employee),
          }))}
          origin={ctx.origin}
          destination={ctx.destination}
          context={draftContext}
          refs={{ simulationId: result.audit?.simulationId || null, policySummary: result.policySummary || null }}
          onSaveDraft={saveAsDraft}
          onConfirmed={async () => {
            setConfirmed(true);
            if (activeDraftId) {
              await deleteSimulation(activeDraftId);
              setActiveDraftId(null);
            }
          }}
        />
      )}
    </div>
  );
}

function PageHero({ teamCount = 0 }) {
  return (
    <section className="surface-card relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent-cyan/[0.05] rounded-full blur-3xl pointer-events-none" />
      <div className="relative px-5 py-5 md:px-8 md:py-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-cyan/15 to-accent-blue/10 flex items-center justify-center border border-accent-cyan/15">
            <RouteIcon className="w-5 h-5 text-accent-cyan" />
          </div>
          <div>
            <h1 className="display-md text-white">Simulação Manual de Mobilização</h1>
            <p className="body text-[13px] mt-1">Cadastre horários, conexões e preços manualmente. O sistema calcula jornada, adicionais e custo total.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent" dot compact>Motor automático</Badge>
          <Badge variant="info" dot compact>Entrada manual</Badge>
          <Badge variant="success" dot compact>Política versionada</Badge>
          {!!teamCount && <Badge variant="success" compact>{teamCount} selecionado(s)</Badge>}
        </div>
      </div>
    </section>
  );
}

function CommonParameters({ ctx, setCtx, cities }) {
  return (
    <section className="surface-card h-full">
      <div className="p-5 md:p-6">
        <SectionTitle icon={RouteIcon} title="Parâmetros comuns" subtitle="Somente o contexto necessário para iniciar a simulação." />
        <div className="mt-5 space-y-4">
          <Field label="Nome da simulação">
            <input
              className="glass-input"
              value={ctx.name}
              onChange={(event) => setCtx({ name: event.target.value })}
              placeholder="Ex.: Mobilização Alta Floresta"
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Origem inicial *">
              <CityAutocomplete
                value={ctx.origin}
                cities={cities}
                required
                placeholder="Buscar cidade de origem..."
                onChange={(origin) => setCtx({ origin })}
              />
            </Field>
            <Field label="Destino final *">
              <CityAutocomplete
                value={ctx.destination}
                cities={cities}
                required
                iconColor="orange"
                placeholder="Buscar cidade de destino..."
                onChange={(destination) => setCtx({ destination })}
              />
            </Field>
          </div>
          <fieldset>
            <legend className="label-micro text-white/55 mb-2">Tipo de viagem *</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['oneway', 'Somente ida'],
                ['roundtrip', 'Ida e volta'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`trip-type-button ${ctx.tripType === value ? 'is-selected' : ''}`}
                  onClick={() => setCtx({ tripType: value, returnDate: value === 'oneway' ? '' : ctx.returnDate })}
                  aria-pressed={ctx.tripType === value}
                >
                  <span className="selection-dot">{ctx.tripType === value && <Check className="w-3 h-3" />}</span>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className={`grid gap-4 ${ctx.tripType === 'roundtrip' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            <DatePicker label="Data de ida *" value={ctx.outboundDate} onChange={(outboundDate) => setCtx({ outboundDate })} />
            {ctx.tripType === 'roundtrip' && (
              <DatePicker
                label="Data de volta *"
                value={ctx.returnDate}
                onChange={(returnDate) => setCtx({ returnDate })}
                minDate={ctx.outboundDate ? new Date(`${ctx.outboundDate}T00:00:00`) : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamSelector({
  employees, selectedEmployees, selectedIds, query, onQuery, onToggle, onSelectVisible, onClear,
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const virtualized = employees.length > 80;
  const rowHeight = 58;
  const visibleStart = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - 3) : 0;
  const visibleEnd = virtualized ? Math.min(employees.length, visibleStart + 12) : employees.length;
  const renderedEmployees = employees.slice(visibleStart, visibleEnd);
  const employeeOption = (employee, virtualIndex = null) => {
    const selected = selectedIds.includes(employee.id);
    const rate = hourlyRateC(employee);
    return (
      <button
        type="button"
        key={employee.id}
        role="option"
        aria-selected={selected}
        className={`employee-option ${selected ? 'is-selected' : ''}`}
        style={virtualIndex === null ? undefined : {
          position: 'absolute',
          left: 6,
          right: 6,
          top: virtualIndex * rowHeight + 6,
          height: rowHeight - 2,
        }}
        onClick={() => onToggle(employee.id)}
      >
        <span className="employee-check">{selected && <Check className="w-3 h-3" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-white/85 truncate">{employeeName(employee)}</span>
          <span className="block text-[11px] text-white/45 truncate">{employeeRole(employee)}</span>
        </span>
        <span className="tabular-data text-[11px] text-white/65 whitespace-nowrap">
          {rate ? `${formatBRL(rate)}/h` : 'sem custo-hora'}
        </span>
      </button>
    );
  };
  return (
    <section className="surface-card h-full">
      <div className="p-5 md:p-6 h-full flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle icon={Users} title="Equipe" subtitle="Custo individual preservado no cálculo." />
          <Badge variant={selectedIds.length ? 'success' : 'neutral'} compact>{selectedIds.length} selecionado(s)</Badge>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
          <input
            className="glass-input pl-10"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar nome, cargo, matrícula, projeto ou cidade..."
            aria-label="Buscar colaborador"
          />
        </div>
        <div
          className="employee-scroll mt-3"
          role="listbox"
          aria-multiselectable="true"
          onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
        >
          {employees.length ? (
            virtualized
              ? <div className="relative" style={{ height: employees.length * rowHeight + 12 }}>
                {renderedEmployees.map((employee, index) => employeeOption(employee, visibleStart + index))}
              </div>
              : renderedEmployees.map((employee) => employeeOption(employee))
          ) : (
            <p className="body text-[12px] text-white/45 p-4 text-center">Nenhum colaborador encontrado.</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <button type="button" className="text-[12px] text-white/60 hover:text-white" onClick={onClear}>Limpar seleção</button>
          <button type="button" className="text-[12px] text-accent-cyan hover:text-white" onClick={onSelectVisible}>Selecionar visíveis</button>
        </div>
        {!!selectedEmployees.length && (
          <div className="flex flex-wrap gap-1.5 mt-3" aria-label="Colaboradores selecionados">
            {selectedEmployees.map((employee) => (
              <button key={employee.id} type="button" className="selected-chip" onClick={() => onToggle(employee.id)}>
                {employeeName(employee)} <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PolicyPanel({ policy }) {
  const lines = policy?.lines || [
    'SEG–SEX: 8h normal · próximas 2h a +50% · excedente a +100%',
    'SÁBADO: todas as horas a +100%',
    'DOMINGO: todas as horas a 2,5×',
    'NOTURNO: 22h–05h a +20%',
    'DESCANSO: 11h consecutivas e qualificáveis para reinício',
  ];
  return (
    <section className="surface-card">
      <div className="p-4 md:px-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent-cyan" />
          <span className="text-[13px] font-semibold text-white/80">
            Política aplicada: {policy ? `${policy.name} v${policy.version}` : 'CLT Padrão v2'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
          {lines.map((line) => <span key={line} className="text-[11px] text-white/50">{line}</span>)}
        </div>
        <span className="label-micro text-white/35">Somente leitura</span>
      </div>
    </section>
  );
}

function ScenarioEditor(props) {
  const {
    scenario, tripType, direction, onDirection, selectedIds, employees, cities,
    openSegmentId, onToggleOpen, onRename, onDuplicate, onRemove, onAddSegment,
    onUpdateSegment, onDuplicateSegment, onRemoveSegment, onMoveSegment,
    onCopyOutbound, result,
  } = props;
  const timeline = scenario[direction] || [];
  const complete = scenarioIsComplete(scenario, selectedIds, tripType);
  return (
    <article className="scenario-card">
      <header className="scenario-header">
        <div className="min-w-0 flex-1">
          <input
            className="scenario-name"
            value={scenario.name}
            onChange={(event) => onRename(event.target.value)}
            aria-label="Nome do cenário"
          />
          <div className="flex items-center gap-2 mt-1">
            {complete
              ? <Badge variant="success" compact>Pronto para calcular</Badge>
              : <Badge variant="warning" compact>Cálculo pendente</Badge>}
            {result && <span className="text-[11px] text-white/50">{formatDuration(result.durationMinutes)} · {formatBRL(result.totalMobilizationCostC)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ActionButton label="Duplicar cenário" onClick={onDuplicate}><Copy className="w-4 h-4" /></ActionButton>
          <ActionButton label="Excluir cenário" onClick={onRemove}><Trash2 className="w-4 h-4" /></ActionButton>
        </div>
      </header>

      {tripType === 'roundtrip' && (
        <div className="direction-tabs" role="tablist" aria-label="Direção da viagem">
          <button role="tab" aria-selected={direction === 'outbound'} className={direction === 'outbound' ? 'is-active' : ''} onClick={() => onDirection('outbound')}>Ida</button>
          <button role="tab" aria-selected={direction === 'return'} className={direction === 'return' ? 'is-active' : ''} onClick={() => onDirection('return')}>Volta</button>
          {direction === 'return' && !scenario.return.length && scenario.outbound.length > 0 && (
            <button className="copy-return-action" onClick={onCopyOutbound}><Copy className="w-3.5 h-3.5" /> Copiar ida para a volta</button>
          )}
        </div>
      )}

      <div className="p-3 md:p-4 space-y-3">
        {!timeline.length && (
          <div className="empty-timeline">
            <RouteIcon className="w-5 h-5" />
            <p>Nenhum trecho na {direction === 'outbound' ? 'ida' : 'volta'}.</p>
            <span>Escolha um tipo abaixo; o editor abrirá imediatamente.</span>
          </div>
        )}
        {timeline.map((segment, index) => (
          <SegmentCard
            key={segment.id}
            segment={segment}
            index={index}
            count={timeline.length}
            employees={employees}
            cities={cities}
            selectedIds={selectedIds}
            open={openSegmentId === segment.id}
            onToggle={() => onToggleOpen(segment.id)}
            onUpdate={(patch) => onUpdateSegment(direction, segment.id, patch)}
            onDuplicate={() => onDuplicateSegment(direction, segment.id)}
            onRemove={() => onRemoveSegment(direction, segment.id)}
            onMove={(offset) => onMoveSegment(direction, segment.id, offset)}
          />
        ))}
        <div className="add-segment-row">
          <span className="label-micro text-white/50 mr-1">Adicionar trecho</span>
          {SEGMENT_TYPES.map((type) => (
            <button key={type.key} type="button" className="add-segment-button" onClick={() => onAddSegment(direction, type.key)}>
              <type.icon className="w-3.5 h-3.5" /> {type.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function SegmentCard({
  segment, index, count, employees, cities, selectedIds, open, onToggle, onUpdate, onDuplicate, onRemove, onMove,
}) {
  const meta = TYPE_META[segment.segmentType];
  const Icon = meta.icon;
  const errors = validateSegment(segment, selectedIds);
  const duration = segmentDuration(segment);
  return (
    <div className={`segment-card ${errors.length ? 'has-errors' : 'is-valid'}`}>
      <div className="segment-summary">
        <button type="button" className="segment-expand" onClick={onToggle} aria-expanded={open}>
          <span className="segment-icon"><Icon className="w-4 h-4" /></span>
          <span className="min-w-0 flex-1 text-left">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-[13px] text-white/90">Trecho {index + 1} — {meta.label}</strong>
              {errors.length
                ? <span className="segment-status error"><AlertTriangle className="w-3 h-3" /> Incompleto</span>
                : <span className="segment-status valid"><CheckCircle className="w-3 h-3" /> Válido</span>}
            </span>
            <span className="block text-[12px] text-white/60 truncate mt-0.5">
              {segment.segmentType === 'waiting'
                ? (segment.originLocationId || 'Cidade da conexão')
                : `${segment.originLocationId || 'Origem'} → ${segment.destinationLocationId || 'Destino'}`}
              {duration ? ` · ${formatDuration(duration)}` : ''}
              {segment.segmentType !== 'waiting' && segment.priceAmount !== ''
                ? ` · ${formatBRL(toCentavos(segmentCommercialAmount(segment)))}`
                : ''}
            </span>
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-white/60" /> : <ChevronDown className="w-4 h-4 text-white/60" />}
        </button>
        <div className="segment-actions">
          <ActionButton label="Mover para cima" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="w-3.5 h-3.5" /></ActionButton>
          <ActionButton label="Mover para baixo" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="w-3.5 h-3.5" /></ActionButton>
          <ActionButton label="Duplicar trecho" onClick={onDuplicate}><Copy className="w-3.5 h-3.5" /></ActionButton>
          <ActionButton label="Excluir trecho" onClick={onRemove}><Trash2 className="w-3.5 h-3.5" /></ActionButton>
        </div>
      </div>
      {open && (
        <SegmentForm
          segment={segment}
          employees={employees}
          cities={cities}
          selectedIds={selectedIds}
          errors={errors}
          duration={duration}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

function SegmentForm({ segment, employees, cities, selectedIds, errors, duration, onUpdate }) {
  if (segment.segmentType === 'waiting') {
    return (
      <div className="segment-form">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Cidade da conexão *">
            <CityAutocomplete
              value={segment.originLocationId}
              cities={cities}
              required
              autoFocus
              placeholder="Buscar cidade da conexão..."
              onChange={(originLocationId) => onUpdate({
                originLocationId,
                destinationLocationId: originLocationId,
                originLocationType: 'city',
                destinationLocationType: 'city',
              })}
            />
          </Field>
          <Field label="Data da conexão *">
            <input
              type="date"
              className="glass-input"
              value={segment.connectionDate}
              onChange={(event) => onUpdate({ connectionDate: event.target.value })}
            />
          </Field>
          <Field label="Duração da conexão (horas) *">
            <input
              type="number"
              min="0.25"
              step="0.25"
              className="glass-input"
              value={segment.connectionHours}
              onChange={(event) => onUpdate({ connectionHours: event.target.value })}
              placeholder="Ex.: 2"
            />
          </Field>
        </div>

        <div className="segment-derived">
          <Metric label="Cidade" value={segment.originLocationId || 'Pendente'} />
          <Metric label="Data da conexão" value={segment.connectionDate || 'Pendente'} />
          <Metric label="Duração calculada" value={duration ? formatDuration(duration) : 'Pendente'} />
          <Metric label="Custo" value="Sem custo" />
        </div>

        {!!errors.length && (
          <ul className="validation-list">
            {errors.map((message) => <li key={message}><AlertTriangle className="w-3.5 h-3.5" /> {message}</li>)}
          </ul>
        )}
      </div>
    );
  }

  const passengers = segment.passengerIds || selectedIds;
  const togglePassenger = (id) => {
    const next = passengers.includes(id) ? passengers.filter((item) => item !== id) : [...passengers, id];
    onUpdate({ passengerIds: next });
  };
  const rest = segment.segmentType === 'hotel_rest';
  const flexibleLabor = ['waiting', 'meal_break', 'hotel_rest'].includes(segment.segmentType);
  const scheduleLabels = rest
    ? {
      departureDate: 'Data de chegada ao hotel *',
      departureTime: 'Hora de chegada ao hotel *',
      arrivalDate: 'Data de checkout / saída *',
      arrivalTime: 'Hora de checkout / saída *',
    }
    : segment.segmentType === 'rental_car'
      ? {
        departureDate: 'Data de retirada / saída *',
        departureTime: 'Hora de retirada / saída *',
        arrivalDate: 'Data de devolução / chegada *',
        arrivalTime: 'Hora de devolução / chegada *',
      }
      : {
        departureDate: 'Data de saída *',
        departureTime: 'Hora de saída *',
        arrivalDate: 'Data de chegada *',
        arrivalTime: 'Hora de chegada *',
      };
  return (
    <div className="segment-form">
      {rest ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Cidade do hotel / descanso *">
            <CityAutocomplete
              value={segment.originLocationId}
              cities={cities}
              required
              autoFocus
              placeholder="Buscar cidade do hotel..."
              onChange={(city) => onUpdate({
                originLocationId: city,
                destinationLocationId: city,
                originLocationType: 'hotel',
                destinationLocationType: 'hotel',
              })}
            />
          </Field>
          <Field label="Hotel ou local de descanso *">
            <input className="glass-input" value={segment.hotelName} onChange={(event) => onUpdate({ hotelName: event.target.value })} placeholder="Nome do hotel ou alojamento" />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Origem *">
            <CityAutocomplete
              value={segment.originLocationId}
              cities={cities}
              required
              autoFocus
              placeholder="Buscar cidade de origem..."
              onChange={(originLocationId) => onUpdate({ originLocationId })}
            />
          </Field>
          <Field label="Destino *">
            <CityAutocomplete
              value={segment.destinationLocationId}
              cities={cities}
              required
              iconColor="orange"
              placeholder="Buscar cidade de destino..."
              onChange={(destinationLocationId) => onUpdate({ destinationLocationId })}
            />
          </Field>
          <Field label="Tipo da origem">
            <select className="glass-input" value={segment.originLocationType} onChange={(event) => onUpdate({ originLocationType: event.target.value })}>
              {LOCATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Tipo do destino">
            <select className="glass-input" value={segment.destinationLocationType} onChange={(event) => onUpdate({ destinationLocationType: event.target.value })}>
              {LOCATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label={scheduleLabels.departureDate}><input type="date" className="glass-input" value={segment.departureDate} onChange={(event) => onUpdate({ departureDate: event.target.value })} /></Field>
        <Field label={scheduleLabels.departureTime}><input type="time" className="glass-input" value={segment.departureTime} onChange={(event) => onUpdate({ departureTime: event.target.value })} /></Field>
        <Field label={scheduleLabels.arrivalDate}><input type="date" className="glass-input" value={segment.arrivalDate} onChange={(event) => onUpdate({ arrivalDate: event.target.value })} /></Field>
        <Field label={scheduleLabels.arrivalTime}><input type="time" className="glass-input" value={segment.arrivalTime} onChange={(event) => onUpdate({ arrivalTime: event.target.value })} /></Field>
      </div>

      <TypeSpecificFields segment={segment} onUpdate={onUpdate} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label={PAID_TYPES.has(segment.segmentType) ? 'Preço manual (R$) *' : 'Preço manual (R$)'}>
          <input type="number" min="0" step="0.01" className="glass-input" value={segment.priceAmount} onChange={(event) => onUpdate({ priceAmount: event.target.value })} />
        </Field>
        <Field label="Alocação do preço *">
          <select className="glass-input" value={segment.priceAllocation} onChange={(event) => onUpdate({ priceAllocation: event.target.value })}>
            {PRICE_ALLOCATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
      </div>

      {flexibleLabor && (
        <div className="flex flex-wrap gap-4 p-3 rounded-xl bg-black/10 border border-white/10">
          <Toggle checked={segment.countsAsLabor === true} onChange={(value) => onUpdate({ countsAsLabor: value })} label="Contabiliza como jornada" />
          <Toggle checked={segment.qualifiesAsRest === true} onChange={(value) => onUpdate({ qualifiesAsRest: value })} label="Qualifica como descanso" />
        </div>
      )}

      {!!employees.length && (
        <div>
          <label className="block label-micro text-white/55 mb-2">Colaboradores vinculados *</label>
          <div className="flex flex-wrap gap-1.5">
            {employees.map((employee) => {
              const selected = passengers.includes(employee.id);
              return (
                <button
                  key={employee.id}
                  type="button"
                  className={`passenger-chip ${selected ? 'is-selected' : ''}`}
                  onClick={() => togglePassenger(employee.id)}
                >
                  {selected && <Check className="w-3 h-3" />} {employeeName(employee)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Field label="Observações">
        <textarea className="glass-input min-h-[76px] resize-y" value={segment.notes} onChange={(event) => onUpdate({ notes: event.target.value })} placeholder="Opcional" />
      </Field>

      <div className="segment-derived">
        <Metric label="Duração calculada" value={duration ? formatDuration(duration) : 'Pendente'} />
        <Metric label="Preço comercial" value={segment.priceAmount !== '' ? formatBRL(toCentavos(segmentCommercialAmount(segment))) : 'Pendente'} />
        <Metric label="Jornada" value={segment.countsAsLabor === false ? 'Não contabiliza' : 'Conforme política'} />
        <Metric label="Direção" value={segment.direction === 'return' ? 'Volta' : 'Ida'} />
      </div>

      {!!errors.length && (
        <ul className="validation-list">
          {errors.map((message) => <li key={message}><AlertTriangle className="w-3.5 h-3.5" /> {message}</li>)}
        </ul>
      )}
    </div>
  );
}

function TypeSpecificFields({ segment, onUpdate }) {
  const set = (field) => (event) => onUpdate({ [field]: event.target.value });
  const shell = (title, description, content) => (
    <section className="rounded-xl border border-accent-cyan/15 bg-accent-cyan/[0.035] p-3 md:p-4">
      <div className="mb-3">
        <h4 className="text-[13px] font-semibold text-white/85">{title}</h4>
        <p className="text-[11px] text-white/45 mt-0.5">{description}</p>
      </div>
      {content}
    </section>
  );

  if (segment.segmentType === 'bus') {
    return shell('Configuração do ônibus', 'Dados comerciais e operacionais próprios do trecho rodoviário.', (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Empresa de ônibus *"><input className="glass-input" value={segment.providerName} onChange={set('providerName')} placeholder="Ex.: Viação Xavante" /></Field>
        <Field label="Classe / serviço"><input className="glass-input" value={segment.serviceClass} onChange={set('serviceClass')} placeholder="Convencional, executivo, leito..." /></Field>
        <Field label="Referência da cotação"><input className="glass-input" value={segment.quoteReference} onChange={set('quoteReference')} placeholder="Código, telefone ou proposta" /></Field>
        <Field label="Bagagem / materiais"><input className="glass-input" value={segment.baggageDescription} onChange={set('baggageDescription')} placeholder="Volumes e condições" /></Field>
        <Field label="Taxas (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.taxesAmount} onChange={set('taxesAmount')} /></Field>
        <Field label="Bagagem adicional (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.baggageFee} onChange={set('baggageFee')} /></Field>
        <Field label="Antecedência de embarque (min)"><input type="number" min="0" className="glass-input" value={segment.boardingLeadMinutes} onChange={set('boardingLeadMinutes')} /></Field>
        <Field label="Tempo de desembarque (min)"><input type="number" min="0" className="glass-input" value={segment.disembarkMinutes} onChange={set('disembarkMinutes')} /></Field>
      </div>
    ));
  }

  if (segment.segmentType === 'flight') {
    return shell('Configuração do voo', 'Dados da companhia, voo, processamento e bagagem.', (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Companhia aérea *"><input className="glass-input" value={segment.providerName} onChange={set('providerName')} placeholder="Ex.: Azul" /></Field>
        <Field label="Número do voo"><input className="glass-input" value={segment.flightNumber} onChange={set('flightNumber')} placeholder="Ex.: AD 2842" /></Field>
        <Field label="Referência da cotação"><input className="glass-input" value={segment.quoteReference} onChange={set('quoteReference')} /></Field>
        <Field label="Bagagem / materiais"><input className="glass-input" value={segment.baggageDescription} onChange={set('baggageDescription')} /></Field>
        <Field label="Taxas aeroportuárias (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.taxesAmount} onChange={set('taxesAmount')} /></Field>
        <Field label="Bagagem adicional (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.baggageFee} onChange={set('baggageFee')} /></Field>
        <Field label="Antecedência / check-in (min)"><input type="number" min="0" className="glass-input" value={segment.boardingLeadMinutes} onChange={set('boardingLeadMinutes')} /></Field>
        <Field label="Retirada de bagagem (min)"><input type="number" min="0" className="glass-input" value={segment.baggageClaimMinutes} onChange={set('baggageClaimMinutes')} /></Field>
      </div>
    ));
  }

  if (segment.segmentType === 'rental_car') {
    return shell('Configuração do veículo locado', 'Locação, condutor, distância e custos rodoviários.', (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Locadora"><input className="glass-input" value={segment.providerName} onChange={set('providerName')} /></Field>
        <Field label="Condutor *"><input className="glass-input" value={segment.driverName} onChange={set('driverName')} /></Field>
        <Field label="Categoria"><input className="glass-input" value={segment.vehicleCategory} onChange={set('vehicleCategory')} placeholder="SUV, sedan, utilitário..." /></Field>
        <Field label="Quantidade de diárias"><input type="number" min="0" step="1" className="glass-input" value={segment.rentalDays} onChange={set('rentalDays')} /></Field>
        <Field label="Distância prevista (km)"><input type="number" min="0" step="0.1" className="glass-input" value={segment.distanceKm} onChange={set('distanceKm')} /></Field>
        <Field label="Consumo (km/L)"><input type="number" min="0" step="0.1" className="glass-input" value={segment.fuelConsumptionKmL} onChange={set('fuelConsumptionKmL')} /></Field>
        <Field label="Combustível (R$/L)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.fuelPricePerLiter} onChange={set('fuelPricePerLiter')} /></Field>
        <Field label="Taxa de devolução (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.oneWayFee} onChange={set('oneWayFee')} /></Field>
        <Field label="Pedágios (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.tollsAmount} onChange={set('tollsAmount')} /></Field>
        <Field label="Estacionamento (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.parkingAmount} onChange={set('parkingAmount')} /></Field>
        <Field label="Quilometragem excedente (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.extraMileageAmount} onChange={set('extraMileageAmount')} /></Field>
        <Field label="Outras cobranças (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.otherChargesAmount} onChange={set('otherChargesAmount')} /></Field>
      </div>
    ));
  }

  if (segment.segmentType === 'company_car') {
    return shell('Configuração do veículo da frota', 'Identificação do veículo, condutor e despesas do percurso.', (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Veículo / placa"><input className="glass-input" value={segment.vehicleReference} onChange={set('vehicleReference')} /></Field>
        <Field label="Condutor"><input className="glass-input" value={segment.driverName} onChange={set('driverName')} /></Field>
        <Field label="Distância prevista (km)"><input type="number" min="0" step="0.1" className="glass-input" value={segment.distanceKm} onChange={set('distanceKm')} /></Field>
        <Field label="Consumo (km/L)"><input type="number" min="0" step="0.1" className="glass-input" value={segment.fuelConsumptionKmL} onChange={set('fuelConsumptionKmL')} /></Field>
        <Field label="Combustível (R$/L)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.fuelPricePerLiter} onChange={set('fuelPricePerLiter')} /></Field>
        <Field label="Pedágios (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.tollsAmount} onChange={set('tollsAmount')} /></Field>
        <Field label="Estacionamento (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.parkingAmount} onChange={set('parkingAmount')} /></Field>
        <Field label="Outros custos (R$)"><input type="number" min="0" step="0.01" className="glass-input" value={segment.otherChargesAmount} onChange={set('otherChargesAmount')} /></Field>
      </div>
    ));
  }

  if (segment.segmentType === 'transfer') {
    return shell('Configuração do transfer', 'Fornecedor, tipo de veículo e margem operacional.', (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Fornecedor"><input className="glass-input" value={segment.providerName} onChange={set('providerName')} /></Field>
        <Field label="Tipo de transfer"><input className="glass-input" value={segment.transferType} onChange={set('transferType')} placeholder="Van, táxi, executivo..." /></Field>
        <Field label="Margem de segurança (min)"><input type="number" min="0" className="glass-input" value={segment.safetyMarginMinutes} onChange={set('safetyMarginMinutes')} /></Field>
      </div>
    ));
  }

  if (segment.segmentType === 'hotel_rest') {
    return shell('Configuração da hospedagem e descanso', 'O descanso efetivo, e não apenas a estadia, controla o reinício da jornada.', (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Quantidade de quartos"><input type="number" min="0" step="1" className="glass-input" value={segment.roomCount} onChange={set('roomCount')} /></Field>
        <Field label="Ocupação por quarto"><input type="number" min="1" step="1" className="glass-input" value={segment.roomOccupancy} onChange={set('roomOccupancy')} /></Field>
        <Field label="Refeições incluídas"><input className="glass-input" value={segment.mealsIncluded} onChange={set('mealsIncluded')} placeholder="Ex.: café da manhã" /></Field>
        <Field label="Referência da cotação"><input className="glass-input" value={segment.quoteReference} onChange={set('quoteReference')} /></Field>
      </div>
    ));
  }

  if (segment.segmentType === 'meal_break') {
    return shell('Configuração da alimentação', 'Identifique o intervalo e seu tratamento operacional.', (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Tipo / descrição da refeição"><input className="glass-input" value={segment.mealDescription} onChange={set('mealDescription')} placeholder="Almoço, jantar, lanche..." /></Field>
        <Field label="Fornecedor / local"><input className="glass-input" value={segment.providerName} onChange={set('providerName')} /></Field>
      </div>
    ));
  }

  return null;
}

function CalculationFooter({ state, complete, error, onCalculate }) {
  return (
    <section className={`calculation-footer ${complete ? 'is-ready' : ''}`}>
      <div className="flex items-center gap-3">
        {state === 'calculating' ? <Loader2 className="w-5 h-5 animate-spin text-accent-cyan" /> : complete ? <CheckCircle className="w-5 h-5 text-mint" /> : <Info className="w-5 h-5 text-amber-400" />}
        <div>
          <p className="text-[13px] font-semibold text-white/85">
            {state === 'calculating' ? 'Recalculando cenário…' : complete ? 'Dados completos' : 'Cálculo pendente'}
          </p>
          <p className="text-[12px] text-white/50">
            {error || (complete ? 'Alterações válidas são recalculadas automaticamente.' : 'Preencha horários, preços e passageiros obrigatórios dos trechos.')}
          </p>
        </div>
      </div>
      <button className="manual-primary-action" disabled={!complete || state === 'calculating'} onClick={onCalculate}>
        {state === 'calculating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gauge className="w-4 h-4" />}
        Recalcular
      </button>
    </section>
  );
}

function Results({ result, onOpenDrawer }) {
  const rows = [...result.scenarios].sort((a, b) => (
    (a.feasibilityStatus === 'invalid') - (b.feasibilityStatus === 'invalid') ||
    a.totalMobilizationCostC - b.totalMobilizationCostC
  ));
  return (
    <div className="space-y-6">
      {result.recommended && (
        <section className="surface-card border border-mint/20 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionTitle icon={CheckCircle} title="Recomendação" subtitle={result.explanation?.summary || 'Cenário viável de menor custo total.'} />
            <Badge variant="success">{result.recommended.scenarioName}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
            <Metric label="Custo total" value={formatBRL(result.recommended.totalMobilizationCostC)} accent="text-mint" />
            <Metric label="Transporte" value={formatBRL(result.recommended.commercialCostC + result.recommended.localMobilityCostC)} />
            <Metric label="Mão de obra" value={formatBRL(result.recommended.laborCostC)} />
            <Metric label="Duração porta a porta" value={formatDuration(result.recommended.durationMinutes)} />
          </div>
        </section>
      )}
      <section className="surface-card p-5 md:p-6 overflow-hidden">
        <SectionTitle icon={Gauge} title="Comparação de cenários" subtitle="O custo total inclui transporte, mão de obra e permanência." />
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-white/10 text-white/45">
              <th className="text-left p-3">Cenário</th><th className="text-right p-3">Transporte</th>
              <th className="text-right p-3">Mão de obra</th><th className="text-right p-3">Permanência</th>
              <th className="text-right p-3">Total</th><th className="text-right p-3">Duração</th>
              <th className="text-left p-3">Status</th><th />
            </tr></thead>
            <tbody>{rows.map((scenario) => (
              <tr key={scenario.id} className="border-b border-white/[0.06] text-white/70">
                <td className="p-3 font-semibold text-white/85">{scenario.scenarioName}</td>
                <td className="p-3 text-right tabular-data">{formatBRL(scenario.commercialCostC + scenario.localMobilityCostC)}</td>
                <td className="p-3 text-right tabular-data">{formatBRL(scenario.laborCostC)}</td>
                <td className="p-3 text-right tabular-data">{formatBRL(scenario.permanenceCostC)}</td>
                <td className="p-3 text-right tabular-data font-bold text-white">{formatBRL(scenario.totalMobilizationCostC)}</td>
                <td className="p-3 text-right tabular-data">{formatDuration(scenario.durationMinutes)}</td>
                <td className="p-3"><StatusBadge status={scenario.feasibilityStatus} detail={scenario.feasibilityDetail} /></td>
                <td className="p-3 text-right"><button className="text-accent-cyan hover:text-white" onClick={() => onOpenDrawer({ scenarioId: scenario.id })}>Detalhar</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {rows.map((scenario) => {
        const failed = (scenario.feasibilityChecks || []).filter((check) => !check.passed);
        if (!failed.length) return null;
        return (
          <div key={scenario.id} className="surface-card border border-amber-400/20 p-4">
            <p className="text-[13px] font-semibold text-white/80 mb-2">{scenario.scenarioName}</p>
            {failed.map((check) => <p key={check.code} className="text-[12px] text-amber-200/75">• {check.message}</p>)}
          </div>
        );
      })}
    </div>
  );
}

function LaborDrawer({ result, drawer, onClose }) {
  const scenario = result.scenarios.find((item) => item.id === drawer.scenarioId);
  if (!scenario) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="w-full max-w-2xl h-full surface-card overflow-y-auto p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div><h2 className="display-md text-white">{scenario.scenarioName}</h2><p className="body text-[13px] mt-1">Cálculo trabalhista individual e auditável.</p></div>
          <ActionButton label="Fechar" onClick={onClose}><X className="w-4 h-4" /></ActionButton>
        </div>
        <div className="space-y-4">
          {scenario.laborByEmployee.map((employee) => {
            const summary = employee.summary;
            return (
              <div key={employee.employeeId} className="surface-recessed rounded-xl p-4 border border-white/10">
                <div className="flex justify-between gap-3 mb-3"><strong className="text-white/85">{employee.employeeName}</strong><strong className="text-mint">{formatBRL(employee.totalCostC)}</strong></div>
                {employee.warning ? <p className="text-[12px] text-amber-300">Sem custo-hora válido.</p> : (
                  <div className="grid grid-cols-2 gap-2">
                    <Row label="Hora normal útil" value={formatDuration(summary.regularMinutes)} />
                    <Row label="HE 50% útil" value={formatDuration(summary.weekdayOvertime50Minutes)} />
                    <Row label="HE 100% útil" value={formatDuration(summary.weekdayOvertime100Minutes)} />
                    <Row label="Sábado 100%" value={formatDuration(summary.saturdayOvertime100Minutes)} />
                    <Row label="Domingo 2,5×" value={formatDuration(summary.sundayPremium150Minutes)} />
                    <Row label="Adicional noturno" value={formatDuration(summary.nightPremiumMinutes)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function ConfirmationGate({ confirmed, scenario, onOpen }) {
  return (
    <section className="surface-card border border-mint/20 p-5 flex flex-wrap items-center gap-4">
      <ShieldCheck className="w-5 h-5 text-mint" />
      <div className="flex-1 min-w-[240px]">
        <h3 className="heading text-white/90">Confirmação final</h3>
        <p className="body text-[13px] mt-1">
          {confirmed
            ? 'Mobilização confirmada e elegível para o Dashboard.'
            : `Cenário selecionado: ${scenario.scenarioName}. Projeto, cronograma/atividade e colaboradores serão exigidos agora.`}
        </p>
      </div>
      {confirmed
        ? <Badge variant="success">Confirmada</Badge>
        : <button className="manual-primary-action" onClick={onOpen}><ShieldCheck className="w-4 h-4" /> Confirmar mobilização</button>}
    </section>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="surface-recessed w-9 h-9 rounded-xl flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-white/65" /></div>
      <div className="min-w-0"><h3 className="heading text-white/90">{title}</h3>{subtitle && <p className="body text-[12px] md:text-[13px] mt-0.5">{subtitle}</p>}</div>
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className="block label-micro text-white/55 mb-2">{label}</label>{children}</div>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-white/70 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-[#49dc7a]" />
      {label}
    </label>
  );
}

function ActionButton({ label, onClick, disabled, children }) {
  return <button type="button" className="manual-icon-button" title={label} aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

function Metric({ label, value, accent = 'text-white/85' }) {
  return <div><span className="label-micro text-white/45">{label}</span><div className={`text-[14px] font-semibold tabular-data mt-1 ${accent}`}>{value}</div></div>;
}

function Row({ label, value }) {
  return <div className="flex items-center justify-between gap-2 text-[12px]"><span className="text-white/50">{label}</span><span className="tabular-data text-white/75">{value}</span></div>;
}

function StatusBadge({ status, detail }) {
  if (status === 'invalid') return <Badge variant="danger" compact>Inválido</Badge>;
  if (detail === 'requires_approval') return <Badge variant="warning" compact>Requer aprovação</Badge>;
  if (detail === 'warning') return <Badge variant="warning" compact>Com alertas</Badge>;
  return <Badge variant="success" compact>Válido</Badge>;
}
