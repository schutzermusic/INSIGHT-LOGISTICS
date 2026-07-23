# Insight Logistics — Orquestração de Migração de Vite + React para Next.js

## 1. Objetivo

Migrar o **Insight Logistics** de **Vite + React** para **Next.js com App Router**, preservando o funcionamento atual e reduzindo o risco de regressões.

A migração deve ser incremental. O sistema atual não deve ser reescrito integralmente nem ficar indisponível durante a transição.

A estratégia central é:

```text
Aplicação Vite + React atual
        ↓
Next.js executando temporariamente a SPA existente
        ↓
Migração gradual das rotas e layouts
        ↓
Migração da autenticação Supabase para SSR/cookies
        ↓
Migração das integrações e cálculos para o servidor
        ↓
Remoção do React Router, Vite e bridge legada
```

---

## 2. Contexto funcional do Insight Logistics

O Insight Logistics deverá suportar:

- gestão de mobilizações e desmobilizações;
- cadastro de colaboradores, cidades, projetos e destinos;
- consulta de alternativas aéreas, rodoviárias e terrestres;
- composição de rotas multimodais;
- comparação de preço, duração e risco operacional;
- cálculo de custo trabalhista durante o deslocamento;
- horas normais, intervalos, adicionais e horas extras;
- encargos incidentes sobre o custo da mão de obra;
- locação de veículos, combustível, pedágio e quilometragem;
- alimentação, hospedagem e despesas intermediárias;
- geração de cenários de menor preço, menor tempo e menor custo total;
- workflow de análise, aprovação e justificativa;
- histórico de cotações e trilha de auditoria;
- RBAC, RLS e segregação de funções;
- integrações com APIs externas;
- futuras integrações com Insight Apex, RH, Financeiro, Paytrack e ERP.

Por esse motivo, a arquitetura final não deve permanecer como uma SPA puramente client-side.

---

## 3. Resultado técnico esperado

Ao final da migração, o projeto deverá possuir:

```text
Next.js App Router
├── Server Components para carregamentos iniciais
├── Client Components apenas onde houver interação
├── Route Handlers para APIs e integrações
├── Server Actions somente quando fizerem sentido
├── Supabase Auth com sessão por cookies
├── Supabase PostgreSQL, RLS e Storage
├── serviços de domínio isolados
├── motor de roteirização
├── motor de custos trabalhistas
├── adapters de provedores externos
├── processamento assíncrono para buscas demoradas
├── logging estruturado
├── trilha de auditoria
└── deploy compatível com Vercel
```

---

## 4. Princípios obrigatórios

1. Não realizar uma reescrita total.
2. Não remover Vite ou React Router antes de a aplicação estar funcional em Next.js.
3. Preservar o comportamento visual e funcional atual durante a primeira etapa.
4. Fazer commits pequenos e reversíveis.
5. Manter o sistema compilando ao término de cada fase.
6. Não expor chaves privadas no navegador.
7. Não mover toda a aplicação para Client Components permanentemente.
8. Separar regra de negócio de componentes React.
9. Não duplicar regras de cálculo entre frontend e backend.
10. Manter Supabase RLS como camada efetiva de segurança.
11. Validar autenticação, autorização e refresh de sessão em cada etapa.
12. Não alterar simultaneamente arquitetura, UI e regras funcionais sem necessidade.
13. Não substituir bibliotecas ou componentes visuais durante a migração, salvo incompatibilidade comprovada.
14. Manter um plano de rollback por fase.
15. Antes de implementar, inspecionar a versão real das dependências e adaptar APIs à versão instalada.

---

## 5. Estratégia de branches e checkpoints

Criar uma branch exclusiva:

```bash
git checkout -b refactor/migrate-vite-to-next
```

Antes de qualquer alteração:

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
```

Criar checkpoint:

```bash
git add .
git commit -m "chore: checkpoint before Next.js migration"
```

Sugestão de commits:

```text
chore: audit current Vite application
chore: bootstrap Next.js runtime
feat: mount legacy SPA inside Next.js
refactor: migrate environment variables
refactor: migrate authentication to Supabase SSR
refactor: migrate authenticated shell
refactor: migrate dashboard routes
refactor: migrate mobilization routes
refactor: migrate route intelligence
feat: add server-side provider adapters
feat: add labor cost engine
chore: remove React Router bridge
chore: remove Vite dependencies
test: complete migration regression coverage
```

---

# 6. Fases da migração

## Fase 0 — Auditoria técnica

### Objetivo

Mapear o projeto atual antes de alterar sua arquitetura.

### Inspeções obrigatórias

- versão do Node.js;
- gerenciador de pacotes;
- versão do React;
- versão do TypeScript;
- versão do Vite;
- estrutura de diretórios;
- aliases de importação;
- React Router e rotas existentes;
- guards de autenticação;
- providers globais;
- Supabase client;
- variáveis `VITE_*`;
- uso de `import.meta.env`;
- bibliotecas de estado;
- bibliotecas de data fetching;
- Tailwind, PostCSS e CSS global;
- bibliotecas de gráficos;
- mapas;
- uploads;
- APIs externas;
- dependências que usam `window`, `document`, `navigator` ou `localStorage`;
- service workers;
- PWA;
- testes unitários;
- testes E2E;
- configuração de deploy;
- funções serverless existentes;
- possíveis chaves privadas expostas no bundle.

### Entregável

Criar:

```text
docs/migration/vite-to-next-audit.md
```

O documento deve listar:

- rotas atuais;
- dependências críticas;
- riscos;
- incompatibilidades;
- variáveis de ambiente;
- componentes exclusivamente client-side;
- sequência recomendada de migração;
- critérios de rollback.

### Critério de aceite

Nenhuma alteração estrutural deve começar sem esse inventário.

---

## Fase 1 — Bootstrap do Next.js

### Objetivo

Adicionar Next.js ao projeto sem remover a aplicação existente.

### Ações

Instalar a versão compatível mais recente do Next.js:

```bash
npm install next
npm install -D eslint-config-next
```

Atualizar scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

Criar:

```text
next.config.ts
next-env.d.ts
src/app/layout.tsx
```

Exemplo inicial:

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

### Regras

- não utilizar `output: "export"` como arquitetura definitiva;
- não remover `vite.config.*`;
- não remover `index.html`;
- não remover `src/main.*`;
- não remover `react-router-dom`;
- não converter todas as telas ainda.

### Critério de aceite

O Next.js deve iniciar e gerar build sem invalidar os arquivos legados.

---

## Fase 2 — Bridge temporária da SPA

### Objetivo

Executar a aplicação Vite existente dentro do runtime do Next.js.

### Estrutura temporária

```text
src/
├── app/
│   ├── layout.tsx
│   ├── client-app.tsx
│   └── [[...slug]]/
│       └── page.tsx
├── App.tsx
├── main.tsx
└── index.css
```

### `src/app/client-app.tsx`

```tsx
"use client";

import dynamic from "next/dynamic";

const LegacyApp = dynamic(() => import("../App"), {
  ssr: false,
  loading: () => <div>Carregando Insight Logistics...</div>,
});

export default function ClientApp() {
  return <LegacyApp />;
}
```

### `src/app/[[...slug]]/page.tsx`

```tsx
import ClientApp from "../client-app";

export default function LegacyCatchAllPage() {
  return <ClientApp />;
}
```

### Observações

- A bridge é temporária.
- O React Router continuará controlando as rotas legadas.
- `ssr: false` deverá ser usado somente nessa camada temporária.
- Não transformar a bridge em arquitetura permanente.

### Critério de aceite

Todas as URLs existentes devem funcionar ao acessar diretamente e ao atualizar a página.

Exemplos:

```text
/login
/dashboard
/mobilizacoes
/mobilizacoes/:id
/inteligencia-de-rotas
/configuracoes
```

---

## Fase 3 — Variáveis de ambiente e configuração

### Objetivo

Migrar a configuração Vite para o modelo de ambiente do Next.js.

### Conversão

```text
VITE_SUPABASE_URL
→ NEXT_PUBLIC_SUPABASE_URL

VITE_SUPABASE_ANON_KEY
→ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

VITE_GOOGLE_MAPS_KEY
→ NEXT_PUBLIC_GOOGLE_MAPS_KEY
```

Substituir:

```ts
import.meta.env.VITE_EXAMPLE
```

por:

```ts
process.env.NEXT_PUBLIC_EXAMPLE
```

### Segredos de servidor

Estas variáveis não podem possuir `NEXT_PUBLIC_`:

```text
SUPABASE_SERVICE_ROLE_KEY
FLIGHTS_API_SECRET
BUS_API_SECRET
RENTAL_API_SECRET
GOOGLE_ROUTES_SERVER_KEY
INTEGRATION_WEBHOOK_SECRET
INTERNAL_ENCRYPTION_KEY
```

### Regras

- auditar o bundle para identificar segredos expostos;
- separar `.env.example` de `.env.local`;
- não versionar valores reais;
- validar variáveis obrigatórias na inicialização;
- criar um módulo de validação tipada.

### Critério de aceite

A aplicação deve funcionar sem qualquer referência restante a `import.meta.env`.

---

## Fase 4 — Compatibilidade de componentes

### Objetivo

Classificar os componentes como server-safe ou client-only.

### Marcar como Client Component quando utilizar

- `useState`;
- `useEffect`;
- `useReducer`;
- handlers de clique;
- `window`;
- `document`;
- `navigator`;
- `localStorage`;
- bibliotecas client-only;
- mapas;
- gráficos que dependam do DOM;
- animações;
- drag and drop.

### Regra

Adicionar `"use client"` no menor limite possível da árvore.

Não colocar `"use client"` indiscriminadamente em layouts e páginas inteiras.

### Critério de aceite

A bridge deve continuar funcionando, e os componentes já migrados não devem gerar erros de hidratação.

---

## Fase 5 — Migração do roteamento

### Objetivo

Substituir React Router pelo App Router gradualmente.

### Mapeamento

| React Router | Next.js |
|---|---|
| `BrowserRouter` | remover |
| `Routes` | estrutura `app/` |
| `Route` | `page.tsx` |
| `Outlet` | `layout.tsx` |
| `Link to` | `Link href` |
| `useNavigate` | `useRouter` |
| `useLocation` | `usePathname` |
| `Navigate` | `redirect` ou `router.replace` |
| `/:id` | `/[id]` |
| `/*` | `/[...slug]` |

### Ordem sugerida

1. Login.
2. Recuperação de senha.
3. Layout autenticado.
4. Dashboard.
5. Colaboradores.
6. Mobilizações.
7. Detalhe da mobilização.
8. Inteligência de rotas.
9. Aprovações.
10. Configurações.
11. Administração.
12. Rotas menos utilizadas.

### Estrutura recomendada

```text
src/app/
├── (public)/
│   ├── login/
│   │   └── page.tsx
│   ├── recuperar-senha/
│   │   └── page.tsx
│   └── layout.tsx
│
├── (authenticated)/
│   ├── layout.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   ├── colaboradores/
│   │   └── page.tsx
│   ├── mobilizacoes/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   ├── inteligencia-de-rotas/
│   │   └── page.tsx
│   ├── aprovacoes/
│   │   └── page.tsx
│   └── configuracoes/
│       └── page.tsx
│
└── api/
```

### Critério de aceite

Cada rota migrada deve ser removida do React Router legado sem afetar as demais.

---

## Fase 6 — Supabase Auth com SSR

### Objetivo

Migrar autenticação client-only para sessão persistida e validada por cookies.

### Dependência

```bash
npm install @supabase/ssr
```

### Estrutura

```text
src/lib/supabase/
├── client.ts
├── server.ts
└── session.ts
```

### Requisitos

- cliente de navegador separado;
- cliente de servidor separado;
- refresh seguro de sessão;
- redirecionamento de usuários não autenticados;
- proteção em páginas e operações;
- RLS mantida;
- autorização por permissão validada no servidor;
- logout invalidando sessão corretamente.

### Middleware ou Proxy

O agente deve inspecionar a versão instalada do Next.js:

- usar `proxy.ts` nas versões em que essa convenção for exigida;
- usar `middleware.ts` caso a versão instalada ainda utilize essa API;
- não assumir nomes sem verificar a documentação da versão efetiva.

### Regra de segurança

Proxy ou middleware não substitui:

- validação no servidor;
- checagem de permissão;
- RLS;
- políticas no banco.

### Critério de aceite

Validar:

- login;
- logout;
- refresh;
- aba nova;
- acesso direto a rota privada;
- sessão expirada;
- usuário sem permissão;
- mudança de perfil;
- redefinição de senha.

---

## Fase 7 — Layout autenticado e providers

### Objetivo

Migrar o shell principal para layout nativo do App Router.

### Estrutura esperada

```tsx
export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProviders>
      <AppShell>
        {children}
      </AppShell>
    </AppProviders>
  );
}
```

### Avaliar os providers existentes

- tema;
- query client;
- autenticação;
- notificações;
- modais;
- permissões;
- preferências;
- analytics;
- feature flags.

### Regra

Providers client-side devem ficar dentro de um componente específico com `"use client"`.

### Critério de aceite

Sidebar, header, navegação, tema e permissões devem funcionar sem depender do `App.tsx` legado.

---

## Fase 8 — Migração da camada de dados

### Objetivo

Evitar que toda a aplicação dependa de buscas client-side.

### Diretrizes

Usar Server Components para:

- carregamento inicial;
- dados de leitura;
- dados sensíveis;
- páginas de detalhe;
- listas que não exijam atualização em alta frequência.

Usar Client Components para:

- filtros interativos;
- formulários;
- mapas;
- gráficos;
- seleção de cenários;
- edição inline;
- polling;
- realtime;
- estados locais.

Usar TanStack Query somente onde agregar valor real.

### Regra

Não duplicar a mesma consulta em Server Component e Client Component sem justificativa.

### Critério de aceite

Reduzir carregamentos client-side desnecessários sem perder interatividade.

---

## Fase 9 — APIs e integrações no servidor

### Objetivo

Mover chamadas privadas e orquestração para o backend do Next.js.

### Estrutura

```text
src/app/api/
├── route-search/
│   └── route.ts
├── quotations/
│   └── route.ts
├── mobilizations/
│   └── route.ts
├── providers/
│   ├── flights/
│   ├── buses/
│   ├── rentals/
│   └── maps/
└── webhooks/
```

### Providers

```text
src/modules/logistics/providers/
├── flight-provider.ts
├── bus-provider.ts
├── rental-provider.ts
├── maps-provider.ts
└── provider-types.ts
```

### Regras

- nunca chamar APIs privadas diretamente do navegador;
- nunca expor API secret em `NEXT_PUBLIC_*`;
- normalizar respostas de provedores;
- implementar timeout;
- implementar retry controlado;
- implementar rate limiting;
- implementar cache quando permitido;
- registrar custo e duração da consulta;
- tratar indisponibilidade parcial;
- manter logs sem dados sensíveis.

### Critério de aceite

O frontend deve consumir endpoints internos ou ações de servidor, nunca credenciais de parceiros.

---

## Fase 10 — Motor de roteirização

### Objetivo

Isolar a geração de rotas multimodais da interface.

### Exemplo de rota

```text
Alta Floresta
→ ônibus até Cuiabá
→ ônibus até Goiânia
→ avião até Belém
→ ônibus até Tucuruí
```

### Entradas mínimas

- origem atual;
- destino final;
- data de saída;
- prazo desejado de chegada;
- colaborador;
- projeto;
- política de viagem;
- meios permitidos;
- restrições;
- necessidade de bagagem;
- quantidade de passageiros.

### Saídas

Cada alternativa deverá apresentar:

- segmentos;
- modal de cada segmento;
- horários;
- duração;
- esperas;
- conexões;
- preço;
- custos adicionais;
- custo trabalhista;
- custo total efetivo;
- risco;
- disponibilidade;
- justificativa;
- score.

### Cenários obrigatórios

- menor preço de transporte;
- menor tempo;
- menor custo total efetivo;
- menor risco operacional;
- recomendação balanceada.

### Critério de aceite

O motor deve ser testável sem renderizar React.

---

## Fase 11 — Motor de custos trabalhistas

### Objetivo

Centralizar as regras de custo do colaborador em deslocamento.

### Componentes do cálculo

```text
Custo total da mobilização =
transporte
+ mão de obra em deslocamento
+ encargos
+ horas extras
+ alimentação
+ hospedagem
+ locação
+ combustível
+ pedágios
+ taxas
+ conexões
+ contingências
```

### Dados necessários

- salário-base;
- divisor mensal;
- encargos;
- jornada diária;
- escala;
- intervalos;
- adicional de horas extras;
- limite diário;
- adicional noturno, quando aplicável;
- regras por convenção;
- data e horário de cada segmento;
- dias úteis, domingos e feriados;
- políticas da empresa.

### Regras

- cálculo não deve existir somente no frontend;
- usar decimal apropriado para valores monetários;
- registrar a versão da política usada;
- armazenar memória de cálculo;
- permitir simulação sem alterar dados oficiais;
- permitir ajuste manual somente com justificativa e auditoria.

### Critério de aceite

O mesmo input deve produzir o mesmo resultado em UI, API, job e relatório.

---

## Fase 12 — Processamento assíncrono

### Objetivo

Evitar requisições longas durante buscas com muitas combinações.

### Fluxo recomendado

```text
Usuário solicita simulação
→ sistema cria registro pending
→ job consulta os provedores
→ normaliza opções
→ monta combinações
→ calcula custos
→ classifica alternativas
→ persiste resultado
→ UI acompanha status
```

### Estados sugeridos

```text
draft
queued
searching
calculating
completed
partially_completed
failed
cancelled
expired
```

### Tecnologias possíveis

Escolher conforme a infraestrutura existente:

- Inngest;
- Trigger.dev;
- Supabase Edge Functions;
- fila gerenciada;
- worker dedicado;
- mecanismo já adotado pelo ecossistema Insight.

### Critério de aceite

Uma consulta lenta não deve bloquear a interface nem duplicar jobs.

---

## Fase 13 — Auditoria e governança

### Registros mínimos

- usuário solicitante;
- colaborador;
- origem;
- destino;
- data da pesquisa;
- provedores consultados;
- parâmetros;
- preços;
- tempos;
- regras trabalhistas;
- versão do motor;
- alternativas descartadas;
- rota recomendada;
- escolha final;
- justificativa;
- aprovadores;
- alterações manuais;
- erros de integração.

### Critério de aceite

Deve ser possível reconstruir por que uma rota foi recomendada ou escolhida.

---

## Fase 14 — Testes

### Testes unitários

- cálculo de hora normal;
- adicionais;
- intervalos;
- jornadas;
- arredondamento;
- custos de veículo;
- score de rota;
- normalização dos provedores;
- combinação multimodal.

### Testes de integração

- Supabase Auth;
- RLS;
- Route Handlers;
- provedores;
- criação de simulação;
- aprovação;
- persistência da memória de cálculo.

### Testes E2E

- login;
- logout;
- dashboard;
- criação de mobilização;
- busca de rotas;
- comparação de alternativas;
- escolha manual;
- aprovação;
- falha de provedor;
- sessão expirada;
- permissão insuficiente;
- refresh em rota dinâmica;
- modo claro/escuro;
- mobile e desktop.

### Critério de aceite

Nenhuma fase deve ser concluída com build quebrado ou fluxo crítico sem teste.

---

## Fase 15 — Observabilidade

Implementar ou validar:

- logs estruturados;
- identificação da simulação;
- duração de chamadas;
- provedor;
- status;
- código do erro;
- tracing;
- métricas;
- alertas;
- captura de exceções;
- ocultação de dados sensíveis.

### Critério de aceite

Falhas devem ser investigáveis sem depender de reproduzir manualmente o caso.

---

## Fase 16 — Remoção do legado

Somente executar quando todas as rotas estiverem migradas.

### Remover

```text
vite
@vitejs/plugin-react
react-router-dom
vite.config.*
index.html
src/main.*
src/app/client-app.tsx
src/app/[[...slug]]/
BrowserRouter
Routes
Route
Outlet
useNavigate
useLocation
import.meta.env
```

### Comandos de auditoria

```bash
grep -R "import.meta.env" src
grep -R "react-router-dom" src
grep -R "BrowserRouter" src
grep -R "useNavigate" src
grep -R "useLocation" src
grep -R "<Routes" src
```

### Critério de aceite

Nenhuma dependência de runtime do Vite ou React Router deve permanecer.

---

# 7. Arquitetura final recomendada

```text
src/
├── app/
│   ├── (public)/
│   ├── (authenticated)/
│   ├── api/
│   ├── layout.tsx
│   ├── loading.tsx
│   ├── error.tsx
│   └── not-found.tsx
│
├── modules/
│   └── logistics/
│       ├── domain/
│       │   ├── entities/
│       │   ├── value-objects/
│       │   ├── policies/
│       │   └── errors/
│       ├── application/
│       │   ├── use-cases/
│       │   ├── commands/
│       │   └── queries/
│       ├── infrastructure/
│       │   ├── repositories/
│       │   ├── jobs/
│       │   └── persistence/
│       ├── providers/
│       │   ├── flights/
│       │   ├── buses/
│       │   ├── rentals/
│       │   └── maps/
│       └── ui/
│
├── services/
│   ├── routing-engine/
│   ├── labor-cost-engine/
│   ├── scoring-engine/
│   └── audit/
│
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── permissions/
│   ├── validation/
│   ├── env/
│   └── observability/
│
├── components/
│   ├── ui/
│   └── layout/
│
└── proxy.ts ou middleware.ts
```

O nome `proxy.ts` ou `middleware.ts` deverá ser escolhido com base na versão efetivamente instalada do Next.js.

---

# 8. Plano de rollback

Cada fase deve possuir um commit próprio.

Se uma fase falhar:

1. preservar logs e evidências;
2. identificar o primeiro commit com regressão;
3. reverter apenas o commit da fase;
4. restaurar a bridge legada;
5. validar build e fluxos críticos;
6. corrigir em uma nova branch ou commit;
7. não continuar para a fase seguinte com regressão aberta.

Durante a migração, a bridge da SPA é o mecanismo principal de contingência.

---

# 9. Definition of Done

A migração somente será considerada concluída quando:

- o projeto utilizar Next.js App Router;
- o build de produção estiver íntegro;
- não houver `import.meta.env`;
- não houver React Router;
- não houver Vite no runtime;
- autenticação funcionar com cookies;
- rotas privadas estiverem protegidas;
- autorização existir no servidor;
- RLS continuar ativa;
- segredos não estiverem no bundle;
- APIs externas forem chamadas no servidor;
- motores de roteirização e custo estiverem isolados;
- jobs longos forem processados de forma adequada;
- rotas diretas e refresh funcionarem;
- testes críticos estiverem aprovados;
- observabilidade estiver habilitada;
- documentação estiver atualizada;
- deploy e rollback estiverem documentados.

---

# 10. Checklist de validação final

```text
[ ] npm install
[ ] npm run typecheck
[ ] npm run lint
[ ] npm run test
[ ] npm run build
[ ] npm run start
[ ] login
[ ] logout
[ ] recuperação de senha
[ ] sessão expirada
[ ] refresh em rota privada
[ ] acesso sem permissão
[ ] RLS
[ ] dashboard
[ ] colaboradores
[ ] mobilizações
[ ] inteligência de rotas
[ ] rota multimodal
[ ] cálculo trabalhista
[ ] comparação de cenários
[ ] escolha manual com justificativa
[ ] aprovação
[ ] logs
[ ] falha parcial de provedor
[ ] timeout
[ ] retry
[ ] responsividade
[ ] tema
[ ] deploy de preview
[ ] deploy de produção
[ ] rollback validado
```

---

# 11. Prompt direcionado para o agente de código

Use o prompt abaixo no Codex, Claude Code ou agente equivalente.

```text
You are a senior staff software engineer and migration lead working on the Insight Logistics platform.

Your task is to migrate the existing application from Vite + React to Next.js App Router safely and incrementally, following the orchestration defined in this file.

First, read this entire migration document and inspect the repository before changing any code.

Core objective:
Migrate the current Vite + React application to Next.js without a full rewrite, without breaking current functionality, and without prematurely removing the legacy runtime.

Mandatory execution strategy:
1. Audit the repository and document the current architecture.
2. Identify the exact versions of Node.js, React, TypeScript, Vite, React Router, Supabase libraries, Tailwind, test frameworks and deployment tooling.
3. Create a migration inventory containing routes, providers, authentication guards, environment variables, browser-only dependencies, exposed secrets, APIs and known risks.
4. Add Next.js to the existing repository.
5. Make the current SPA run temporarily inside Next.js through a client-only legacy bridge and optional catch-all route.
6. Keep Vite, React Router, index.html and the existing entry point until the migrated application is stable.
7. Migrate environment variables from import.meta.env and VITE_* to the correct Next.js model.
8. Keep public browser variables separate from server-only secrets.
9. Migrate routes gradually from React Router to the App Router.
10. Migrate public routes first, then the authenticated shell, then business modules.
11. Implement Supabase SSR using separate browser and server clients.
12. Store and refresh authentication sessions through cookies.
13. Preserve Supabase RLS and enforce authorization on the server.
14. Inspect the installed Next.js version before deciding whether the project requires proxy.ts or middleware.ts.
15. Move private provider calls, route calculations and sensitive integrations to server-side Route Handlers, server services or jobs.
16. Never expose provider secrets, service-role keys or private credentials to client components.
17. Isolate route orchestration, multimodal route generation and labor-cost calculations from React UI code.
18. Preserve current UI behavior during the architectural migration.
19. Do not redesign the interface unless a compatibility issue requires a minimal change.
20. Add or update automated tests for every migrated critical flow.
21. Keep the project buildable at the end of every phase.
22. Use small, intentional and reversible commits.
23. Remove Vite, React Router and the legacy bridge only after every route and flow has been migrated and validated.

Insight Logistics business constraints:
- The system compares air travel, bus travel, rental vehicles and multimodal combinations.
- A cheaper ticket is not necessarily the lowest-cost option because employee travel time, regular hours, overtime, charges, meals, lodging and intermediate connections must be considered.
- The routing engine must support indirect paths such as:
  Alta Floresta → Cuiabá by bus → Goiânia by bus → Belém by air → Tucuruí by bus.
- The final ranking must be able to distinguish:
  lowest transport price,
  shortest duration,
  lowest effective total cost,
  lowest operational risk,
  balanced recommendation.
- Calculation rules must be deterministic, auditable and reusable outside React.
- Every recommendation must preserve its input parameters, provider responses, calculation policy version, cost memory, discarded alternatives and final decision.
- Manual overrides require justification and audit history.

Engineering constraints:
- TypeScript strict mode.
- No use of any where an explicit domain type can be created.
- No direct database access scattered throughout UI components.
- No duplicated business rules.
- No client-side service-role access.
- No hidden fallbacks that silently replace live data with mocks.
- No broad use of "use client".
- No full rewrite.
- No dependency removal before validation.
- No architecture changes unrelated to the migration.
- No destructive database changes without an explicit migration and rollback path.

Expected workflow for each phase:
1. Explain the current problem.
2. List the files that will change.
3. Implement the smallest safe change.
4. Run typecheck, lint, tests and production build.
5. Fix failures before continuing.
6. Summarize what changed.
7. List remaining risks.
8. Create a checkpoint commit.

Required initial deliverable:
Create docs/migration/vite-to-next-audit.md with:
- current architecture;
- dependency versions;
- current route map;
- authentication flow;
- authorization model;
- providers;
- environment variables;
- browser-only components;
- APIs;
- exposed-secret risks;
- migration blockers;
- proposed phase order;
- rollback plan.

Do not begin large-scale route conversion until the audit is complete.

Required final validation:
- npm install succeeds;
- typecheck passes;
- lint passes;
- tests pass;
- production build passes;
- direct navigation and refresh work;
- login, logout and password recovery work;
- private routes reject unauthenticated users;
- RBAC and RLS work;
- no import.meta.env remains;
- no React Router remains;
- no Vite runtime remains;
- no server secret is present in the browser bundle;
- provider calls run on the server;
- route search and cost calculation remain functional;
- deployment and rollback are documented.

When information is missing, inspect the repository and make the safest evidence-based decision. Do not guess the existing architecture. Do not rewrite stable modules unnecessarily. Start with the audit and proceed phase by phase.
```

---

# 12. Prompt curto para iniciar a execução

```text
Read the migration plan at the specified file path in full. Audit the current Insight Logistics repository first, then execute the Vite + React to Next.js App Router migration incrementally and phase by phase. Do not perform a full rewrite, do not remove the legacy Vite/React Router runtime before all migrated routes are validated, and keep typecheck, lint, tests and production build passing after every phase. Start by creating the repository audit document required by the plan.
```

---

## 13. Observação final

A prioridade é trocar a base arquitetural sem alterar prematuramente o comportamento do produto.

A migração deve transformar o Insight Logistics em uma aplicação full-stack modular, com segurança de servidor, autenticação consistente, integrações protegidas e motores de negócio reutilizáveis, sem sacrificar a estabilidade da versão atual.
