# INSIGHT LOGISTICS — SIMULAÇÃO MANUAL DE MOBILIZAÇÃO

## Especificação completa de implementação

## 1. Objetivo

Transformar a aba atual **Comparador** em uma **Simulação Manual de Mobilização** permanente e enterprise, permitindo que a operação continue funcionando enquanto a integração rodoviária automática estiver indisponível.

O usuário deverá informar manualmente:

- Colaborador ou equipe.
- Origem inicial e destino final.
- Data e horário de disponibilidade para saída.
- Prazo máximo de chegada.
- Cada trecho de ônibus, avião, veículo, transfer, espera, hotel ou descanso.
- Data e horário de saída e chegada de cada trecho.
- Preço manual de cada passagem ou despesa.

O sistema deverá calcular automaticamente:

- Duração de cada trecho.
- Esperas e conexões.
- Tempo total porta a porta.
- Horas normais.
- HE 50% em dias úteis.
- HE 100% em dias úteis.
- Todas as horas de sábado a 100%.
- Todas as horas de domingo com adicional de 150%, multiplicador total 2,50.
- Adicional noturno entre 22h e 5h.
- Descanso interjornada e reinício ou não da jornada.
- Custo trabalhista individual.
- Custo trabalhista consolidado da equipe.
- Passagens, hospedagem, alimentação, transfers, locação, combustível, pedágios e demais despesas.
- Custo total de cada cenário.
- Viabilidade e recomendação.

A simulação manual deve utilizar o **mesmo motor normalizado de itinerário, cálculo trabalhista, custo operacional, validação, recomendação, auditoria e aprovação** utilizado pela aba automática de Mobilização.

Não criar um segundo motor de cálculo isolado.

---

# 2. Posicionamento do produto

## 2.1 Aba Mobilização

A aba **Mobilização** continua sendo o fluxo automático:

```text
Origem + destino + colaboradores + prazo de chegada
→ consulta dos provedores
→ geração automática de itinerários
→ cálculo de custos
→ recomendação
```

Quando a integração rodoviária estiver indisponível, mostrar um estado claro:

```text
Busca rodoviária automática temporariamente indisponível.

Utilize a Simulação Manual para cadastrar os trechos e calcular
jornada, adicionais e custo total com o mesmo motor de mobilização.
```

CTA:

```text
Abrir Simulação Manual
```

Não expor credenciais, chaves, stack traces ou detalhes internos do provedor.

## 2.2 Aba Comparador

Alterar o propósito visual da aba para:

```text
Simulação Manual de Mobilização
```

Subtítulo:

```text
Cadastre horários, conexões e preços manualmente.
O sistema calcula automaticamente jornada, adicionais e custo total.
```

A rota interna atual pode ser preservada caso a alteração gere regressão desnecessária.

A funcionalidade manual deve continuar existindo mesmo após o retorno do provedor, pois será útil para:

- Cotações recebidas por telefone ou WhatsApp.
- Rotas não cobertas pelos provedores.
- Fretamentos.
- Tarifas negociadas.
- Exceções operacionais.
- Simulações históricas.

---

# 3. Princípio arquitetural obrigatório

Todos os modos devem convergir para o mesmo domínio:

```text
Dados automáticos dos provedores ─┐
                                  ├─→ Itinerário normalizado
Entrada manual de trechos ─────────┘
                                        ↓
                              Normalização da timeline
                                        ↓
                              Validação de viabilidade
                                        ↓
                              Motor de custo trabalhista
                                        ↓
                              Motor de custo operacional
                                        ↓
                              Motor de recomendação
                                        ↓
                              Auditoria e aprovação
```

Criar ou reutilizar uma abstração semelhante a:

```typescript
interface ItinerarySourceAdapter {
  buildItineraries(
    input: ItinerarySourceInput,
  ): Promise<NormalizedItinerary[]>;
}
```

Implementações esperadas:

```typescript
ManualItineraryAdapter
FlightProviderAdapter
BusProviderAdapter
RentalVehicleAdapter
CompanyFleetAdapter
MixedProviderAdapter
```

O adaptador manual deve apenas transformar os dados digitados em um itinerário normalizado.

Nenhum adaptador deve conter fórmulas próprias de horas extras ou custo final.

---

# 4. Política trabalhista atualizada

Implementar como política empresarial configurável e versionada.

Não fixar as regras diretamente em componentes de interface.

## 4.1 Segunda a sexta-feira

```text
Primeiras 8 horas contabilizadas:
hora normal
multiplicador total 1,00

Próximas 2 horas contabilizadas:
HE +50%
multiplicador total 1,50

Horas excedentes:
HE +100%
multiplicador total 2,00
```

## 4.2 Sábado

```text
Todas as horas contabilizadas no sábado:
HE +100%
multiplicador total 2,00
```

Regras obrigatórias:

- Não existem horas normais no sábado.
- Não existe faixa de HE 50% no sábado.
- O adicional de 100% começa no primeiro minuto contabilizado do sábado.
- Não consumir primeiro uma faixa de 8 horas normais.

## 4.3 Domingo

```text
Todas as horas contabilizadas no domingo:
hora-base + adicional de 150%
multiplicador total 2,50
```

## 4.4 Adicional noturno

```text
Período noturno:
22:00 até 05:00

Adicional:
+20%
```

O adicional noturno é sobreposto à classificação principal.

Não criar horas duplicadas.

Exemplo:

```text
Sábado das 23h às 00h

Classificação principal:
Sábado +100%, multiplicador 2,00

Sobreposição:
Noturno +20%
```

O modo de acumulação deve ser configurável:

```text
Multiplicativo:
valor-hora × 2,00 × 1,20

Aditivo:
valor-hora × (1 + 1,00 + 0,20)
```

A política ativa deve indicar explicitamente qual modo está sendo usado.

## 4.5 Descanso interjornada

Configuração inicial:

```text
11 horas consecutivas
660 minutos consecutivos
```

A jornada somente pode ser reiniciada após um bloco de descanso qualificável e ininterrupto.

Exemplo insuficiente:

```text
Liberação efetiva no hotel: 05h00
Nova saída: 12h00
Descanso: 7h

Resultado:
Não reiniciar a jornada
Déficit: 4h
Alerta crítico de conformidade
```

Exemplo suficiente:

```text
Liberação efetiva no hotel: 05h00
Nova saída: 16h00
Descanso: 11h

Resultado:
Reinício permitido
Nova sequência de classificação
```

Comportamentos obrigatórios:

- A virada da meia-noite não reinicia a jornada.
- A chegada física ao hotel não inicia automaticamente o descanso.
- O descanso começa quando o colaborador está efetivamente liberado.
- Check-in, bagagem, transfer ou outra atividade podem postergar o início.
- As horas da jornada anterior continuam registradas e devidas.
- O reinício afeta apenas a nova sequência de classificação.
- Descanso inferior ao mínimo não pode reiniciar silenciosamente a jornada.
- O tratamento financeiro do déficit interjornada deve ser configurável e validado com RH/jurídico.

---

# 5. Dados do colaborador

O usuário deve selecionar o colaborador ou a equipe antes de construir os cenários.

Para cada colaborador, carregar:

- ID.
- Nome.
- Cargo.
- Cidade atual.
- Escala ativa.
- Política trabalhista ativa.
- Divisor mensal de horas.
- Valor da hora-base.
- Valor da hora com custo carregado, quando existente.
- Valor específico de projeto, quando aplicável.
- Horas já trabalhadas no dia de partida.
- Fonte das horas trabalhadas.
- Última sincronização.
- Status de qualidade dos dados.

## 5.1 Bases de custo suportadas

```text
Hora-base salarial
Hora com encargos/custo carregado
Hora específica do projeto
```

A base escolhida deve ser gravada no snapshot do cálculo.

Não expor salário bruto para usuários sem permissão.

O usuário pode visualizar o custo trabalhista calculado sem necessariamente visualizar o salário.

Nunca utilizar ponto flutuante para dinheiro.

Utilizar decimal seguro ou valores inteiros em centavos.

---

# 6. Fluxo da simulação

## Etapa 1 — Contexto

Campos:

- Nome da simulação.
- Colaborador ou equipe.
- Origem inicial.
- Destino final.
- Partida mais cedo.
- Prazo máximo de chegada.
- Projeto.
- Contrato.
- Centro de custo.
- Unidade de negócio.
- Observações.

Campos opcionais:

- Bagagem.
- Ferramentas e materiais.
- Categoria de veículo.
- Necessidades específicas.
- Tipo do destino final: hotel, base, obra, usina ou local customizado.

## Etapa 2 — Cenários

Permitir vários cenários:

```text
Cenário A — Somente ônibus
Cenário B — Ônibus + aéreo + ônibus
Cenário C — Veículo locado
Cenário D — Frota + aéreo
```

Ações:

- Criar cenário.
- Duplicar cenário.
- Renomear cenário.
- Arquivar cenário.
- Excluir cenário.

Duplicar cenário é obrigatório para permitir pequenos ajustes sem redigitar tudo.

## Etapa 3 — Trechos

Cada cenário é composto por trechos ordenados.

Ação principal:

```text
+ Adicionar trecho
```

Tipos:

- Ônibus.
- Voo.
- Veículo locado.
- Veículo da frota.
- Transfer.
- Táxi ou transporte local.
- Espera ou conexão.
- Processamento em aeroporto.
- Processamento em rodoviária.
- Retirada de bagagem.
- Hotel/descanso.
- Intervalo de alimentação.
- Descanso obrigatório de condução.
- Trecho operacional customizado.

## Etapa 4 — Timeline calculada

Exibir:

- Duração.
- Espera automática.
- Viabilidade da conexão.
- Tempo contabilizado como jornada.
- Classificação trabalhista.
- Custo.
- Alertas.

## Etapa 5 — Comparação

Apresentar:

- Menor custo total.
- Mais rápido.
- Menor custo de transporte.
- Menor complexidade.
- Recomendado.
- Inválidos.

## Etapa 6 — Saída

Permitir:

- Salvar rascunho.
- Recalcular.
- Selecionar cenário.
- Enviar para aprovação.
- Exportar resumo quando o padrão atual do sistema suportar.

---

# 7. Editor manual de trechos

## 7.1 Campos comuns

- Tipo do trecho.
- Local de origem.
- Local de destino.
- Tipo do local de origem.
- Tipo do local de destino.
- Data e hora local de saída.
- Data e hora local de chegada.
- Fuso da origem.
- Fuso do destino.
- Fornecedor ou empresa.
- Tipo de preço.
- Valor.
- Moeda.
- Passageiros vinculados.
- Regra de contabilização trabalhista.
- Observações.
- Data da cotação.
- Validade da cotação.
- Indicador de preço manual.
- Anexo ou referência da cotação, quando disponível.

## 7.2 Tipos de preço

```text
Por pessoa
Total para os passageiros selecionados
Total do cenário
Por veículo
Por quarto
Por diária
Por quilômetro
Sem custo
```

Evitar multiplicar um valor total como se fosse por pessoa.

## 7.3 Ônibus

Campos:

- Cidade e rodoviária de origem.
- Cidade e rodoviária de destino.
- Empresa.
- Classe ou serviço.
- Saída.
- Chegada.
- Preço por pessoa ou total.
- Taxas.
- Bagagem.
- Referência da cotação.
- Antecedência de embarque.
- Tempo de desembarque.

A duração deve ser derivada de saída e chegada.

Não pedir horas totais como fonte principal.

## 7.4 Voo

Campos:

- Aeroporto de origem.
- Aeroporto de destino.
- Companhia.
- Número do voo opcional.
- Saída.
- Chegada.
- Tarifa.
- Taxas.
- Bagagem.
- Antecedência de check-in.
- Embarque.
- Retirada de bagagem.
- Troca de terminal.
- Referência da cotação.

## 7.5 Veículo locado

Campos:

- Local de retirada.
- Local de devolução.
- Data/hora da retirada.
- Data/hora da devolução.
- Saída rodoviária.
- Chegada prevista.
- Condutor.
- Passageiros.
- Categoria.
- Valor da diária.
- Quantidade de diárias cobradas.
- Taxa de devolução em outra cidade.
- Distância.
- Consumo.
- Preço do combustível.
- Pedágios.
- Estacionamento.
- Quilometragem excedente.
- Outras cobranças.

## 7.6 Veículo da frota

Campos:

- Veículo.
- Condutor.
- Passageiros.
- Origem.
- Destino.
- Saída.
- Chegada.
- Distância.
- Consumo.
- Preço do combustível.
- Pedágios.
- Estacionamento.
- Custo interno por diária ou quilômetro.
- Rateio de manutenção, quando configurado.

## 7.7 Transfer

Campos:

- Origem.
- Destino.
- Saída.
- Chegada.
- Tipo.
- Preço por pessoa ou total.
- Fornecedor.
- Margem de segurança.
- Passageiros.

## 7.8 Hotel e descanso

Campos:

- Hotel/local.
- Chegada ao hotel.
- Liberação efetiva para descanso.
- Fim do descanso.
- Checkout ou saída.
- Valor por quarto ou pessoa.
- Quantidade de quartos.
- Ocupação.
- Refeições inclusas.
- Passageiros.

Valores derivados:

- Duração efetiva do descanso.
- Reinício permitido ou não.
- Déficit.
- Status de conformidade.

## 7.9 Alimentação

Campos:

- Início.
- Fim.
- Valor por pessoa ou total.
- Contabiliza como jornada ou não.
- Passageiros.

## 7.10 Espera e conexão

Preferencialmente derivada do intervalo entre trechos.

Permitir criação explícita quando precisar de classificação específica.

Campos:

- Local.
- Início.
- Fim.
- Motivo.
- Contabiliza como jornada.
- Qualifica como descanso.
- Status de segurança.

---

# 8. Geração automática de lacunas

Quando um trecho termina antes do próximo, criar uma lacuna derivada.

Exemplo:

```text
Chegada do ônibus:
08h00 na Rodoviária de Goiânia

Saída do voo:
13h30 no Aeroporto de Goiânia
```

Não tratar automaticamente as 5h30 como uma espera única.

Detectar:

- Desembarque.
- Transfer rodoviária → aeroporto.
- Check-in.
- Segurança/embarque.
- Espera residual.

Quando não houver dados exatos, aplicar estimativas configuradas.

Permitir confirmação e ajuste manual.

Mostrar a origem de cada estimativa:

```text
Gerado pela política de conexão
Ajustado manualmente
```

Auditar os ajustes.

---

# 9. Continuidade geográfica

Validar a continuidade dos trechos.

Exemplo:

```text
Destino anterior:
Rodoviária de Goiânia

Próxima origem:
Aeroporto de Goiânia
```

Exigir transfer com tempo e custo.

Mensagem sugerida:

```text
A transferência entre a rodoviária e o aeroporto ainda não foi informada.

Deseja adicionar uma transferência estimada?
```

Verificar:

- Local exato.
- Cidade.
- Terminal.
- Aeroporto.
- Hotel.
- Obra.
- Usina.
- Retirada/devolução de veículo.

A rota somente termina quando chegar ao destino operacional final.

---

# 10. Modelo normalizado

Adaptar aos modelos existentes e evitar duplicidade.

```typescript
type ItinerarySource =
  | "manual"
  | "flight_provider"
  | "bus_provider"
  | "rental_provider"
  | "company_fleet"
  | "mixed";

type NormalizedItinerary = {
  id: string;
  simulationId: string;
  scenarioId: string;
  source: ItinerarySource;
  originLocationId: string;
  destinationLocationId: string;
  departureAtUtc: string;
  arrivalAtUtc: string;
  originTimezone: string;
  destinationTimezone: string;
  totalDurationMinutes: number;
  segments: NormalizedItinerarySegment[];
  passengerIds: string[];
  status: "draft" | "calculated" | "selected" | "submitted";
};

type NormalizedItinerarySegment = {
  id: string;
  sequence: number;
  segmentType:
    | "bus"
    | "flight"
    | "rental_car"
    | "company_car"
    | "transfer"
    | "waiting"
    | "airport_process"
    | "bus_terminal_process"
    | "baggage_claim"
    | "hotel_rest"
    | "meal_break"
    | "mandatory_rest"
    | "custom";
  originLocationId: string;
  destinationLocationId: string;
  departureAtUtc: string;
  arrivalAtUtc: string;
  originTimezone: string;
  destinationTimezone: string;
  providerName?: string;
  providerReference?: string;
  priceAmountMinor: number;
  currency: string;
  priceAllocation:
    | "per_person"
    | "selected_passengers_total"
    | "scenario_total"
    | "per_vehicle"
    | "per_room"
    | "per_day"
    | "per_kilometer"
    | "none";
  passengerIds: string[];
  laborActivityType: string;
  countsAsLabor: boolean;
  qualifiesAsRest: boolean;
  source: "manual" | "derived" | "provider";
  metadata: Record<string, unknown>;
};
```

---

# 11. Motor de cálculo trabalhista

O cálculo deve ser individual por colaborador.

Colaboradores podem ter:

- Valores-hora diferentes.
- Escalas diferentes.
- Horas já trabalhadas diferentes.
- Políticas diferentes.
- Históricos de descanso diferentes.

Não usar média da equipe.

## 11.1 Entrada

```typescript
type EmployeeLaborCalculationInput = {
  employeeId: string;
  itinerary: NormalizedItinerary;
  employeeCostProfileSnapshot: EmployeeCostProfileSnapshot;
  laborPolicyVersion: LaborPolicyVersion;
  travelTimePolicyVersion: TravelTimePolicyVersion;
  workedMinutesBeforeDeparture: number;
  workedMinutesSource: string;
  holidayCalendarId?: string;
};
```

## 11.2 Saída

```typescript
type EmployeeLaborCalculationResult = {
  employeeId: string;
  regularMinutes: number;
  weekdayOvertime50Minutes: number;
  weekdayOvertime100Minutes: number;
  saturdayOvertime100Minutes: number;
  sundayPremium150Minutes: number;
  nightPremiumMinutes: number;
  restMinutes: number;
  restDeficitMinutes: number;
  journeyResetCount: number;
  laborCostAmountMinor: number;
  blocks: LaborCostBlock[];
  warnings: CalculationWarning[];
};
```

## 11.3 Fronteiras de cálculo

Dividir a timeline em blocos nos seguintes eventos:

- Início do trecho.
- Fim do trecho.
- Meia-noite.
- Início de sábado.
- Início de domingo.
- Início de feriado.
- 05h00.
- 22h00.
- Final das 8 horas úteis normais.
- Final das 2 horas úteis a 50%.
- Início do descanso.
- Conclusão dos 660 minutos de descanso.
- Fim do descanso.
- Mudança de política.
- Mudança de fuso.

Usar precisão de minuto com segmentação por eventos.

## 11.4 Prioridade do sábado

```typescript
if (isSaturday(localDateTime)) {
  baseClassification = "saturday_overtime_100";
  baseMultiplier = 2.0;
}
```

Não consumir 8 horas normais.

Não aplicar faixa de 50%.

## 11.5 Prioridade do domingo

```typescript
if (isSunday(localDateTime)) {
  baseClassification = "sunday_premium_150";
  baseMultiplier = 2.5;
}
```

## 11.6 Sobreposição noturna

Aplicar somente à parte entre 22h e 5h.

```typescript
type LaborCostBlock = {
  startAtUtc: string;
  endAtUtc: string;
  localTimezone: string;
  activityType: string;
  countedMinutes: number;
  baseClassification:
    | "weekday_regular"
    | "weekday_overtime_50"
    | "weekday_overtime_100"
    | "saturday_overtime_100"
    | "sunday_premium_150"
    | "custom";
  baseMultiplier: string;
  nightPremiumApplied: boolean;
  nightMultiplier?: string;
  totalBlockCostMinor: number;
  policyVersionId: string;
  explanation: string;
};
```

## 11.7 Descanso

```typescript
if (
  restSegment.qualifiesAsRest &&
  uninterruptedRestMinutes >= laborPolicy.minimumInterShiftRestMinutes
) {
  resetJourneyCounters();
  complianceStatus = "compliant";
} else {
  doNotResetJourneyCounters();
  registerRestDeficit();
  complianceStatus = "critical_warning";
}
```

Nunca reiniciar apenas pela mudança de data.

---

# 12. Política de contabilização do tempo

Criar ou reutilizar política versionada para definir se cada atividade conta como jornada.

Exemplos:

- Tempo no ônibus.
- Tempo no avião.
- Passageiro em veículo.
- Condutor do veículo.
- Espera em aeroporto.
- Espera em rodoviária.
- Espera em conexão.
- Transfer.
- Check-in.
- Embarque.
- Retirada de bagagem.
- Viagem noturna de ônibus.
- Viagem noturna aérea.
- Descanso em hotel.
- Alimentação.
- Descanso obrigatório.
- Atrasos.

```typescript
type TravelTimePolicyVersion = {
  id: string;
  name: string;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  rules: Record<string, {
    countsAsLabor: boolean;
    qualifiesAsRest: boolean;
    percentageCounted?: string;
  }>;
  status: "draft" | "approved" | "retired";
};
```

Não assumir que todos os tempos possuem o mesmo tratamento.

---

# 13. Motor de custos

## 13.1 Transporte

- Passagens de ônibus.
- Passagens aéreas.
- Taxas.
- Bagagem.
- Transfers.
- Táxi.
- Locação.
- Frota.
- Combustível.
- Pedágios.
- Estacionamento.
- Taxa de devolução.
- Quilometragem excedente.

## 13.2 Mão de obra

Por colaborador:

- Hora normal útil.
- HE 50% útil.
- HE 100% útil.
- Sábado 100%.
- Domingo 150%.
- Adicional noturno.
- Outros adicionais configurados.
- Total individual.

## 13.3 Permanência

- Hotel.
- Alimentação.
- Diárias.
- Deslocamento local.
- Verbas específicas do projeto.

## 13.4 Consolidação

```text
Custo total da mobilização =
transporte
+ mão de obra
+ permanência
+ mobilidade local
+ outros custos configurados
```

Exibir custo por colaborador e consolidado da equipe.

---

# 14. Múltiplos colaboradores

Cada trecho pode atender:

- Toda a equipe.
- Apenas parte da equipe.
- Grupos diferentes.

Exemplo:

```text
Colaboradores A, B e C:
aéreo

Colaboradores D e E:
ônibus

Todos:
transfer final
```

Cada trecho deve registrar explicitamente seus passageiros.

O cálculo individual deve considerar apenas os trechos daquele colaborador.

Somente consolidar após calcular individualmente.

---

# 15. Validação de viabilidade

Validar antes da recomendação:

- Existe ao menos um colaborador.
- A rota é contínua da origem ao destino.
- Chegada é posterior à saída.
- Ordem cronológica válida.
- Não existem sobreposições impossíveis para o mesmo colaborador.
- Transfers entre terminais estão presentes.
- Margem de conexão suficiente.
- Chegada dentro do prazo.
- Hotel/descanso não sobrepõe viagem.
- Passageiros são consistentes.
- Tipo de preço é válido.
- Fuso disponível.
- Descanso do condutor respeitado.
- Capacidade do veículo suficiente.
- Bagagem e equipamento atendidos.
- Cotação ainda válida quando houver expiração.

Status:

```text
Válido
Válido com alertas
Requer aprovação
Inválido
```

Cenários inválidos não podem ser recomendados.

---

# 16. Motor de recomendação

Prioridade padrão:

1. Atende ao prazo de chegada.
2. Menor custo total de mobilização.
3. Menor risco de conformidade.
4. Menor duração.
5. Menos trocas de modal.
6. Menos conexões.
7. Menor fadiga.
8. Cotação mais recente.

Rótulos:

- Recomendado.
- Menor custo total.
- Mais rápido.
- Menor preço de transporte.
- Menor complexidade.
- Requer aprovação.
- Inválido.

Explicação determinística:

```text
Recomendado: Aéreo + rodoviário

Embora o transporte custe R$ 3.900,00 a mais que o cenário rodoviário,
o menor tempo de mobilização reduz o custo trabalhista em R$ 5.600,00.

Economia total estimada: R$ 1.700,00
Tempo economizado: 27h40
```

IA generativa pode melhorar o texto, mas não pode calcular nem alterar valores.

---

# 17. UI/UX da aba atual

Preservar a linguagem visual premium e clara atual.

Não redesenhar páginas não relacionadas.

## 17.1 Cabeçalho

```text
Simulação Manual de Mobilização
Monte itinerários manualmente e compare o custo total da operação.
```

Badges:

```text
Motor de cálculo automático
Entrada manual
Política versionada
```

## 17.2 Card da equipe

Mostrar:

- Nome.
- Cargo.
- Custo-hora.
- Horas trabalhadas no dia.
- Política aplicada.
- Status dos dados.

Não mostrar salário sem identificação clara e permissão.

## 17.3 Parâmetros comuns

Manter:

- Origem.
- Destino.
- Projeto.
- Contrato.
- Centro de custo.
- Partida mais cedo.
- Prazo de chegada.
- Valores padrão de hotel e alimentação.

Remover:

- Horas normais/dia.
- HE 50%/dia.
- HE 100%/dia.
- HE 150%/dia.
- Noturnas/dia.

## 17.4 Política aplicada

Mostrar somente leitura:

```text
Política aplicada: CLT Padrão v2

SEG–SEX: 8h normal
SEG–SEX: próximas 2h a +50%
SEG–SEX: excedente a +100%
SÁBADO: todas as horas a +100%
DOMINGO: todas as horas a 2,5×
NOTURNO: 22h–05h a +20%
DESCANSO: 11h consecutivas para reinício
```

Ação:

```text
Ver política completa
```

A edição deve ficar na Administração.

## 17.5 Workspace de cenários

Substituir cards rígidos por cenários flexíveis:

```text
Cenário A — Ônibus
Cenário B — Ônibus + Aéreo
Cenário C — Veículo locado
+ Novo cenário
```

Dentro:

```text
+ Ônibus
+ Voo
+ Veículo
+ Transfer
+ Hotel/descanso
+ Alimentação
+ Espera
```

## 17.6 Timeline editável

Cada item deve mostrar:

- Tipo e ícone.
- Origem/destino.
- Saída/chegada.
- Duração.
- Preço.
- Passageiros.
- Prévia da classificação trabalhista.
- Alertas.
- Editar, duplicar, reordenar e excluir.

## 17.7 Resumo ao vivo

Mostrar:

- Transporte.
- Mão de obra.
- Hotel.
- Alimentação.
- Transfers.
- Veículo.
- Total.
- Duração.
- Chegada.
- Conformidade.

Recalcular com debounce após alterações válidas.

## 17.8 Drawer de cálculo trabalhista

Por colaborador:

```text
Hora normal útil
HE 50% útil
HE 100% útil
Sábado 100%
Domingo 2,5×
Adicional noturno sobreposto
Descanso
Déficit de descanso
Custo total
```

Permitir inspeção dos blocos por minuto/fronteira.

## 17.9 Comparação

| Cenário | Transporte | Mão de obra | Permanência | Total | Duração | Chegada | Status |
|---|---:|---:|---:|---:|---:|---|---|

Destacar custo total, não somente passagem.

---

# 18. Persistência e banco

Antes das migrations:

- Inspecionar schema atual.
- Reutilizar entidades existentes.
- Evitar conceitos duplicados.
- Preservar histórico.
- Criar snapshots imutáveis.

Entidades possíveis, somente se não houver equivalente:

```text
manual_mobilization_simulations
manual_mobilization_scenarios
manual_itinerary_segments
segment_passengers
labor_policy_versions
travel_time_policy_versions
employee_cost_profile_snapshots
itinerary_cost_snapshots
employee_labor_calculations
labor_calculation_blocks
scenario_feasibility_checks
scenario_recommendations
manual_quote_attachments
```

Lifecycle da simulação:

```text
draft
calculated
selected
submitted
approved
rejected
expired
archived
```

Lifecycle do cenário:

```text
draft
valid
warning
invalid
selected
superseded
```

---

# 19. Auditoria

Registrar:

- Criador.
- Data de criação.
- Último editor.
- Alterações relevantes.
- Seleção de colaboradores.
- Inclusão, edição, exclusão e reordenação de trechos.
- Preço manual e origem.
- Data e validade da cotação.
- Lacunas automáticas.
- Ajustes manuais.
- Justificativas.
- Snapshot do custo-hora.
- Snapshot das horas trabalhadas.
- Versão da política trabalhista.
- Versão da política de contabilização.
- Blocos de cálculo.
- Breakdown de custos.
- Resultados de viabilidade.
- Motivos da recomendação.
- Cenário selecionado.
- Aprovações.

Quando o usuário escolher diferente da recomendação:

```text
Recomendação do sistema
Escolha do usuário
Diferença de custo e tempo
Justificativa obrigatória
```

Não sobrescrever a recomendação original.

---

# 20. Permissões

Reutilizar RBAC.

Permissões sugeridas:

- Visualizar simulações.
- Criar simulação.
- Editar próprio rascunho.
- Editar qualquer rascunho.
- Visualizar custo-hora.
- Visualizar custo carregado.
- Visualizar salário de origem.
- Visualizar breakdown trabalhista.
- Editar política.
- Sobrescrever recomendação.
- Enviar para aprovação.
- Aprovar mobilização.
- Visualizar auditoria.

Aplicar masking de dados sensíveis.

---

# 21. Serviços e APIs

Adaptar aos padrões existentes.

Serviços sugeridos:

```text
ManualSimulationService
ManualScenarioService
ManualItineraryAdapter
TimelineNormalizationService
EmployeeCostProfileService
WorkedTimeContextService
LaborPolicyService
TravelTimePolicyService
LaborCostEngine
OperationalCostEngine
ScenarioFeasibilityService
ScenarioRecommendationService
MobilizationAuditService
```

Possíveis endpoints:

```text
POST   /manual-mobilizations
GET    /manual-mobilizations/:id
PATCH  /manual-mobilizations/:id

POST   /manual-mobilizations/:id/scenarios
PATCH  /manual-scenarios/:scenarioId
DELETE /manual-scenarios/:scenarioId
POST   /manual-scenarios/:scenarioId/duplicate

POST   /manual-scenarios/:scenarioId/segments
PATCH  /manual-segments/:segmentId
DELETE /manual-segments/:segmentId
POST   /manual-scenarios/:scenarioId/reorder-segments

POST   /manual-scenarios/:scenarioId/calculate
GET    /manual-scenarios/:scenarioId/calculation
GET    /manual-scenarios/:scenarioId/labor-breakdown

POST   /manual-mobilizations/:id/compare
POST   /manual-mobilizations/:id/select-scenario
POST   /manual-mobilizations/:id/submit-for-approval
```

Não introduzir REST se o projeto utilizar consistentemente server actions, RPC ou outro padrão.

---

# 22. Validação de formulários

Validar no cliente e servidor:

- Campos obrigatórios.
- Datas válidas.
- Fusos válidos.
- Chegada posterior à saída.
- Valores monetários positivos.
- Passageiros válidos.
- Tipo de preço.
- Continuidade.
- Margem de conexão.
- Prazo de chegada.
- Descanso.
- Capacidade do veículo.
- Condutor.
- Trechos duplicados.

Mensagens acionáveis.

Exemplo:

```text
O ônibus chega à Rodoviária de Goiânia às 08h00, mas o próximo trecho
começa no Aeroporto de Goiânia às 09h00.

Inclua o tempo de transferência e a antecedência de embarque.
```

---

# 23. Fusos e datas

- Armazenar timestamps em UTC.
- Armazenar ou derivar fuso de cada local.
- Exibir horário local.
- Classificar jornada usando o fuso local da atividade.

Tratar:

- Virada da meia-noite.
- Sexta para sábado.
- Sábado para domingo.
- 22h e 5h.
- Múltiplos fusos.
- Horário de verão quando aplicável.
- Descanso atravessando fusos.

Não calcular diferença usando strings formatadas.

---

# 24. Performance

- Validar formulário imediatamente.
- Persistir rascunho com debounce.
- Recalcular somente o cenário afetado.
- Recalcular somente colaboradores afetados.
- Cachear snapshots durante a sessão.
- Usar processo assíncrono para equipes grandes.
- Mostrar status de cálculo.
- Evitar resposta antiga substituindo edição nova.
- Usar idempotência em cálculo e envio.

---

# 25. Testes obrigatórios

## 25.1 Motor trabalhista

1. Dia útil com 8h normais.
2. Dia útil com 10h: 8h normal + 2h a 50%.
3. Dia útil com 12h: 8h normal + 2h a 50% + 2h a 100%.
4. Sábado desde o primeiro minuto a 100%.
5. Sábado acima de 8h, tudo a 100%.
6. Sábado noturno com sobreposição.
7. Domingo desde o primeiro minuto a 2,50.
8. Domingo noturno.
9. Sexta para sábado.
10. Sábado para domingo.
11. Fronteira de 22h.
12. Fronteira de 5h.
13. Horas já trabalhadas antes da partida.
14. Meia-noite sem descanso não reinicia.
15. Hotel com 7h não reinicia.
16. Hotel com 11h reinicia.
17. Atividade interrompendo descanso.
18. Chegada ao hotel antes da liberação.
19. Múltiplos fusos.
20. Acumulação aditiva.
21. Acumulação multiplicativa.
22. Alimentação incluída/excluída.
23. Espera incluída/excluída.
24. Colaboradores com valores-hora diferentes.
25. Arredondamento monetário seguro.

## 25.2 Itinerário manual

1. Ônibus direto.
2. Voo direto.
3. Ônibus + voo + ônibus.
4. Ônibus + ônibus + voo + ônibus.
5. Veículo locado.
6. Frota.
7. Transfer rodoviária → aeroporto.
8. Espera derivada.
9. Transfer ausente.
10. Sobreposição impossível.
11. Chegada anterior à saída.
12. Prazo excedido.
13. Preço por pessoa.
14. Preço total.
15. Preço por veículo.
16. Passageiros diferentes.
17. Hotel com descanso suficiente.
18. Hotel com descanso insuficiente.
19. Duplicação de cenário.
20. Reordenação.

## 25.3 Integração

- Seleção de colaboradores.
- Snapshot do custo.
- Busca das horas já trabalhadas.
- Persistência de trechos.
- Normalização.
- Cálculo trabalhista.
- Custo operacional.
- Comparação.
- Recomendação.
- Auditoria.
- Masking.
- Aprovação.

## 25.4 E2E obrigatório

```text
Origem: Alta Floresta
Destino: Tucuruí
Equipe: pelo menos 2 colaboradores com custos-hora diferentes
```

Itinerário:

```text
Alta Floresta → Cuiabá por ônibus
Cuiabá → Goiânia por ônibus
Rodoviária de Goiânia → Aeroporto de Goiânia por transfer
Goiânia → Belém por voo
Aeroporto de Belém → Rodoviária de Belém por transfer
Belém → Tucuruí por ônibus
```

Validar:

- Entrada manual de todos os trechos.
- Duração por timestamps.
- Geração de espera.
- Exigência de transfers.
- Sábado 100% desde o primeiro minuto.
- Domingo 2,50 quando aplicável.
- Noturno sobreposto.
- Cálculo individual.
- Preços por pessoa e totais.
- Custo total.
- Comparação com pelo menos 2 alternativas.
- Recomendação.
- Salvamento e envio para aprovação.

---

# 26. Critérios de aceite

## Entrada manual

- Seleção de colaboradores antes dos cenários.
- Trechos ilimitados dentro de limite técnico razoável.
- Ônibus e voo recebem saída, chegada e preço manual.
- Usuário não digita totais de horas extras.
- Duração automática.
- Rotas multimodais.

## Cálculo trabalhista

- Regras úteis automáticas.
- Sábado a 100% desde o primeiro minuto.
- Domingo a 2,50.
- Noturno sem duplicação.
- Horas já trabalhadas consideradas.
- Meia-noite não reinicia.
- Descanso de 11h reinicia.
- Descanso insuficiente não reinicia e gera alerta.

## Custos

- Cada colaborador utiliza o próprio custo-hora.
- Alocação de preço correta.
- Transporte, mão de obra, permanência e veículo separados.
- Total reproduzível pelo breakdown.
- Dinheiro calculado com precisão decimal.

## UX

- Inputs manuais de HE removidos.
- Política visível e somente leitura.
- Timeline clara.
- Mensagens acionáveis.
- Comparação enfatiza custo total.
- Origem manual do preço identificada.
- Falha do provedor oferece acesso ao simulador.

## Arquitetura

- Manual e automático compartilham os mesmos motores.
- Não existe segundo motor trabalhista.
- Payload específico de provedor não chega ao motor de custos.
- Snapshots históricos imutáveis.
- Dados sensíveis protegidos.
- Auditoria completa.

---

# 27. Fases de implementação

## Fase 1 — Discovery

- Inspecionar Comparador e Mobilização.
- Localizar lógica atual de rotas, custos e colaboradores.
- Inspecionar schema e migrations.
- Mapear adapters atuais.
- Mapear políticas.
- Mapear auditoria e aprovação.
- Produzir mapa de gaps.

## Fase 2 — Corrigir a política

- Atualizar sábado para todas as horas a 100%.
- Confirmar domingo 2,50.
- Validar noturno sobreposto.
- Adicionar descanso mínimo.
- Versionar política.
- Criar testes.

## Fase 3 — Normalização compartilhada

- Definir/reutilizar contratos normalizados.
- Encapsular origens manual e automática.
- Validar continuidade e fusos.

## Fase 4 — Domínio da simulação

- Persistência de simulação e cenários.
- Trechos manuais.
- Passageiros.
- Alocação de preço.
- Metadados da cotação.
- Snapshots.

## Fase 5 — UI manual

- Alterar propósito do Comparador.
- Remover inputs de HE.
- Adicionar equipe e política.
- Criar cenários.
- Criar timeline.
- Adicionar hotel, descanso e transfer.
- Adicionar resumo ao vivo.

## Fase 6 — Integração do cálculo

- Normalizar itinerário manual.
- Calcular por colaborador.
- Consolidar custos.
- Validar viabilidade.
- Recomendar.

## Fase 7 — Comparação

- Tabela de comparação.
- Labels.
- Explicação determinística.
- Drawer trabalhista.
- Estados inválidos.

## Fase 8 — Outage do provedor

- Status de saúde.
- CTA para modo manual.
- Preservar modo automático.
- Manter manual como função permanente.

## Fase 9 — Auditoria e aprovação

- Eventos de auditoria.
- Masking.
- Override com justificativa.
- Aprovação.

## Fase 10 — Rollout

- Unit, integration e E2E.
- Validar mobilizações históricas.
- Feature flag.
- Piloto.
- Monitorar variação estimado × real.

---

# 28. Restrições de engenharia

- Inspecionar antes de implementar.
- Preservar design atual.
- Reutilizar entidades e componentes.
- Não criar motor trabalhista paralelo.
- Não hardcodar políticas na UI.
- Não pedir ao usuário cálculo manual de horas.
- Não usar float para dinheiro.
- Não usar IA generativa para cálculo.
- Não reiniciar jornada à meia-noite.
- Não reiniciar com descanso insuficiente.
- Não tratar as primeiras 8h de sábado como normais.
- Não duplicar horas noturnas.
- Não ignorar transfers.
- Não considerar aeroporto/rodoviária como destino final automaticamente.
- Não expor salário sem permissão.
- Não expor credenciais.
- Não substituir dados reais por mocks silenciosos.
- Não regredir Mobilização automática.
- Utilizar tipos estritos e evitar `any`.
- Documentar migrations e compatibilidade.
- Testar todas as regras não óbvias.

---

# 29. Entregáveis

1. Relatório de discovery.
2. Plano por arquivos.
3. Migrations.
4. Política trabalhista atualizada e versionada.
5. Política de contabilização de tempo.
6. Adaptador de itinerário manual.
7. Timeline normalizada.
8. Motor trabalhista compartilhado.
9. Motor de custos compartilhado.
10. Validação de viabilidade.
11. Recomendação.
12. Nova UI do Comparador.
13. Timeline editável.
14. Breakdown trabalhista.
15. Auditoria.
16. Permissões.
17. Integração de aprovação.
18. Testes unitários.
19. Testes de integração.
20. E2E Alta Floresta → Tucuruí.
21. Relatório final com limitações e evidências.

---

# 30. Prompt curto para iniciar a execução

```text
Read this entire specification and inspect the existing repository before changing code.

Map the current Comparador, Mobilização, employee-cost, labor-policy, route-provider, database, audit, and approval architecture. Identify reusable components and gaps.

Then produce a file-level implementation plan for transforming Comparador into the permanent Manual Mobilization Simulator described here. The manual and automatic flows must share the same normalized itinerary, labor-cost, operational-cost, feasibility, recommendation, and audit engines.

Important active policy rules:
- Monday–Friday: first 8h regular, next 2h at +50%, excess at +100%.
- Saturday: every counted minute at +100%; no regular or +50% band.
- Sunday: every counted minute at total multiplier 2.50.
- Night premium: +20% between 22:00 and 05:00, overlapping without duplicated hours.
- Journey reset: only after at least 11 consecutive hours of qualifying uninterrupted rest; midnight alone never resets it.

Do not modify code until the discovery and implementation plan are complete. Avoid duplicate entities and parallel calculation engines.
```

---

# 31. Nota de conformidade

As regras acima devem ser implementadas como **políticas empresariais configuráveis e versionadas**. Antes do rollout em produção, validar com RH, departamento pessoal e jurídico:

- Forma de contabilização do tempo de viagem e espera.
- Forma de acumulação do adicional noturno.
- Tratamento financeiro de descanso interjornada insuficiente.
- Feriados.
- Convenções coletivas.
- Regras específicas para colaboradores que conduzem veículos.

---

# 31. UX revision — compact search form, searchable team selector, and editable segment schedules

This section supersedes any conflicting layout or field requirements described earlier in this document.

## 31.1 Revised page layout

The Manual Mobilization Simulator must use a two-column top layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ Parâmetros comuns                         │ Equipe            │
│                                           │                   │
│ Nome da simulação                         │ Search employees  │
│ Origem inicial                            │ Scrollable list   │
│ Destino final                             │ Selected chips    │
│ [Somente ida | Ida e volta]               │                   │
│ Data de ida                               │                   │
│ Data de volta, when round trip            │                   │
└───────────────────────────────────────────────────────────────┘
```

The employee selector must sit beside the common parameters rather than occupying a full-width block above them.

On smaller screens, stack the cards vertically:

```text
Parâmetros comuns
Equipe
Cenários
```

## 31.2 Searchable and scrollable team selector

Replace the fixed employee grid with a compact selector card.

Required behavior:

- Search field by employee name, role, registration number, project, or current city.
- Scrollable employee list with a constrained height.
- Open/close expansion or drawer when the list is large.
- “Select all visible” action.
- “Clear selection” action.
- Selected-employee counter.
- Selected employees shown as compact chips.
- Keyboard navigation and accessible focus states.
- Virtualization when the employee directory becomes large.
- Preserve each employee’s individual hourly-cost profile in the calculation.
- Do not expose salary when the user only has permission to view hourly cost.

Suggested card structure:

```text
Equipe                                           3 selecionados

[ Buscar colaborador...                         ]

[ ] Everton Pereira              Líder de Mecânica     R$ 29,35/h
[x] Antonio Marcos Leite Silva   Técnico                R$ 24,06/h
[x] Amarildo Cândido de Lima     Supervisor             R$ 40,91/h
[x] Jhon Wender de Oliveira      Bobinador              R$ 24,04/h
...

[Limpar seleção]                     [Selecionar visíveis]
```

The employee list should use a maximum visible height and internal scrolling. It must not expand the entire page unnecessarily.

## 31.3 Simplified common parameters

The **Parâmetros comuns** card must contain only:

- Simulation name.
- Initial origin.
- Final destination.
- Trip type:
  - One way.
  - Round trip.
- Outbound date.
- Return date, only when round trip is selected.

Remove from this card:

- Earliest departure.
- Maximum arrival deadline.
- Departure timezone.
- Deadline timezone.
- Days in field.
- Project / cost center.
- Manual labor-hour fields.
- Any user-entered normal, overtime, Saturday, Sunday, or night-hour totals.

The interaction should follow the same pattern already used in **Inteligência de Rotas** for origin, destination, outbound date, and return date.

Suggested structure:

```text
Nome da simulação

Origem inicial          Destino final

Tipo de viagem
(•) Somente ida
( ) Ida e volta

Data de ida             Data de volta
                        shown only for round trip
```

## 31.4 Location selectors

Origin and destination must use controlled location selectors rather than unrestricted text whenever the current application already has a city/location search component.

Support:

- City and state.
- Airport.
- Bus terminal.
- Company base.
- Worksite.
- Hotel.
- Custom operational point.

For the common parameters, default to city-level selection. More precise terminals and operational points are defined inside itinerary segments.

## 31.5 Project and schedule are required at confirmation, not in the initial form

Do not show project, cost center, schedule, or work package inside the simplified common-parameters card.

These references remain mandatory in the final confirmation step.

Before confirming a selected scenario, require:

- Project.
- Schedule, phase, activity, or work package.
- Identified collaborator(s).
- Selected scenario.
- Cost and labor snapshots.

Draft simulations can be created without project allocation, but they must not feed the dashboard until confirmation is complete.

## 31.6 Scenario editor must support date and time for every segment

The current scenario card is incomplete if it only displays a transport label such as:

```text
Ônibus ? → ?
```

Every added segment must open an editable form, inline panel, accordion, or side drawer.

The user must be able to enter the actual departure and arrival schedule for each segment.

### Required fields for bus and flight segments

- Segment type.
- Origin.
- Destination.
- Departure date.
- Departure time.
- Arrival date.
- Arrival time.
- Price.
- Price allocation:
  - Per employee.
  - Total for selected employees.
- Provider/company, optional.
- Assigned employees.
- Notes, optional.

The system derives:

- Segment duration.
- Total scenario duration.
- Connection waiting time.
- Labor classification.
- Segment labor cost.
- Segment commercial cost.
- Compliance warnings.

### Bus example

```text
Trecho 1 — Ônibus

Origem
Alta Floresta — MT

Destino
Cuiabá — MT

Saída
23/07/2026 06:00

Chegada
23/07/2026 18:00

Preço
R$ 280,00 por colaborador

Duração calculada
12h00
```

### Flight example

```text
Trecho 3 — Voo

Origem
Goiânia — GYN

Destino
Belém — BEL

Saída
24/07/2026 13:00

Chegada
24/07/2026 15:30

Preço
R$ 920,00 por colaborador

Antecedência de embarque
2h00, policy default

Duração do voo
2h30
```

## 31.7 Segment creation interaction

When the user selects:

```text
+ Ônibus
+ Voo
+ Veículo locado
+ Veículo da frota
+ Transfer
+ Espera / Conexão
+ Hotel / Descanso
+ Alimentação
```

the system must immediately create an editable segment and focus the first required field.

Do not add a visually empty segment that cannot be configured.

Recommended interaction:

```text
Add segment
→ choose type
→ segment editor opens
→ user enters origin, destination, dates, times, and price
→ validate
→ save segment
→ recalculate scenario
```

Each segment must have:

- Edit.
- Duplicate.
- Delete.
- Move up.
- Move down.
- Expand/collapse.
- Validation status.

## 31.8 Automatic continuity and intelligent defaults

For each new segment:

- Default its origin to the previous segment destination.
- Default its departure date to the previous segment arrival date.
- Do not automatically force the departure time.
- Suggest a minimum connection time based on segment types.
- Automatically calculate waiting when there is a time gap.
- Warn when the next segment begins before the previous segment ends.
- Require transfer when adjacent segments use different physical terminals.

Example:

```text
Previous segment:
arrival at Goiânia Bus Terminal — 08:00

Next segment:
flight from Goiânia Airport — 13:00

System proposes:
Bus terminal → airport transfer
Airport processing
Residual waiting
```

## 31.9 One-way and round-trip scenarios

When **Somente ida** is selected:

- Build only the outbound itinerary.
- Hide return fields and return-scenario sections.

When **Ida e volta** is selected:

- Show outbound and return dates.
- Allow separate outbound and return itineraries.
- Use clear tabs or sections:

```text
Ida
Volta
```

- Do not assume the return uses the same modal or route.
- Allow duplicating and reversing the outbound route as a starting point.
- Calculate labor and cost continuously using real dates, rest periods, field days, and return schedule.

Suggested action:

```text
Copiar ida para a volta
```

This action must create editable copied segments, not a permanently linked mirror.

## 31.10 Scenario-level results

After the user enters valid times and prices, show live results:

```text
Duração total
Custo de passagens
Custo trabalhista
Hospedagem
Alimentação
Transfer
Veículo
Custo total
Horário final de chegada
Status
```

If information is incomplete, show:

```text
Cálculo pendente
Preencha os horários e preços obrigatórios dos trechos.
```

Do not show zero values as though the calculation were complete.

## 31.11 Visual hierarchy and contrast

Ensure that active controls, segment actions, and input values are clearly readable.

Do not render editable scenario controls with disabled-like opacity.

Required contrast improvements:

- Stronger text contrast inside editable segment cards.
- Clearly visible “Novo cenário” action.
- Clearly visible add-segment buttons.
- Distinct selected employee state.
- Distinct validation error state.
- Distinct calculated/valid state.
- Avoid excessive white haze over active form content.

The interface may remain light and premium, but operational controls must not appear inactive.

## 31.12 Updated acceptance criteria

The implementation is not complete unless:

- The team selector is beside the common-parameters card on desktop.
- The employee list supports search and internal scrolling.
- Common parameters contain only simulation name, origin, destination, one-way/round-trip selection, and applicable dates.
- Timezone, earliest-departure, maximum-arrival, days-in-field, and project fields are removed from the initial form.
- Project and schedule remain mandatory at confirmation.
- Every bus, flight, vehicle, transfer, waiting, hotel, or meal segment can be edited.
- Bus and flight segments accept departure and arrival date/time.
- Segment duration is calculated from timestamps.
- Prices can be entered manually per person or as a total.
- Connections and waiting are calculated automatically.
- Round-trip simulations support separate outbound and return timelines.
- An empty segment can never remain unconfigurable.
- The scenario recalculates automatically after valid edits.
- Incomplete scenarios clearly show that calculation is pending.

