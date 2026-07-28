# Insight Logistics — Dashboard Redesign V3
## Control Tower · Design Direction & Implementation Brief

> Base: `src/pages/Dashboard.jsx` (585 ln), `src/index.css`, `src/styles/variables.css`, `src/components/ui/TubelightNavbar.jsx`, `src/components/map/CesiumHudGlobe.jsx`.
> Objective: move from "well-built generic dark dashboard" to a credible enterprise control tower.

---

# 1. Redesign direction summary

## The one-sentence thesis

> **The current dashboard decorates data. The redesign should stage it.**

Everything on the page is currently rendered at roughly the same visual volume — eight KPIs of identical weight, ten panels with identical chrome, five accent colours competing at equal saturation. There is no answer to *"what am I supposed to look at first?"* That single absence is what reads as "AI-generated": the layout is correct but has no point of view.

## The five moves

| # | Move | From → To |
|---|------|-----------|
| **1** | **Collapse the accent system** | 6 chart hues + mint + cyan + orange + purple + blue, all at equal saturation → **one interface accent (amber `#F39444`)**, mint demoted to *positive-delta semantic only*, red reserved exclusively for critical. |
| **2** | **Break KPI democracy** | 8 identical cells in a 4×2 grid → **1 primary financial figure + 3 supporting + 4 compact operational chips.** |
| **3** | **Make the globe the stage, not a widget** | 5-of-12 column, 300px, inside the hero card → **full-bleed hero canvas with floating HUD overlays**; KPIs sit *on* the operations layer, not beside it. |
| **4** | **Separate strategy from operations** | 10 alternating panels of the same weight → **two explicitly different zones**: *Command* (live, dark, glass, on-canvas) and *Analysis* (calm, flat, high-contrast, tabular). |
| **5** | **Stop glowing everything** | Radial glows on hero + `premium-panel-mint/orange/purple` + `text-gradient-premium` + tubelight beam → **glow only where something is live.** Glow becomes a *status signal*, not decoration. |

## What is already right — keep it

- The confirmed-mobilizations-only data contract, and the fact it's stated in the UI. That's real product credibility. **Elevate it, don't hide it.**
- Integer centavos → formatted at the edge (`formatBRL`). Keep.
- `surface-elevated / card / recessed` three-tier depth model. Excellent bones — it's just applied uniformly instead of hierarchically.
- Drill-down drawer on every aggregate. Genuinely enterprise. Extend it to *every* number on the page.
- Lazy Cesium with SVG HUD fallback. Keep.
- `label-micro` (11px / 600 / 0.16em uppercase) is a strong caption style. Keep the recipe, retune the tracking.

---

# 2. Section-by-section critique of the current dashboard

### 2.1 Top navigation — `TubelightNavbar.jsx`

| Issue | Detail |
|---|---|
| **Logo is oversized** | `w-[240px]` at a 72px header. It's ~28% of a 1440px viewport for a wordmark that carries no information after second 1. |
| **Absolute-centred pill collides** | `absolute left-1/2 -translate-x-1/2` with 7 items ("Simulação Mobilização", "Inteligência de Rotas") — at 1280–1440px this either overlaps the 240px logo or forces the mobile icon-only collapse far too early. |
| **Active state is the loudest element on the page** | A solid white pill + a mint tubelight beam with double `box-shadow` glow, floating over a dark UI. It out-shouts the KPI numbers. Nav should be the *quietest* persistent chrome. |
| **Two glass capsules, no relationship** | Nav pill and toggle capsule are both `surface-elevated` rounded-full, unrelated in size and position. Reads as two floating widgets, not one bar. |
| **No page context** | No breadcrumb, no environment badge, no global search, no notification surface — all expected in an operations product. |

### 2.2 Hero — `premium-panel-hero`

- **Two competing focal points.** `display-md` "Insight Logistics" wordmark + a 3D globe, side by side. The product name is not information; it does not deserve hero typography on the primary screen. In the reference board, the hero title sits *behind* the map as an atmospheric layer — exactly right.
- **Gradient text on the brand name** (`text-gradient-premium`, mint→cyan→mint) is the single most "template" element on the page.
- **The hero card contains everything**: badge, title, subtitle, live pill, CTA, 8 KPIs and the globe, all inside one bordered rounded rectangle with two blurred radial blobs. It's a container, not a composition.
- **Live indicator is buried** at 11px `text-white/50` in the top-right. In a control tower, "is this live?" is a primary question.
- **Subtitle repeats the badge.** Badge says "Mobilizações confirmadas"; subtitle says "somente mobilizações confirmadas alimentam os indicadores". Same fact, twice, 400ms apart in the reading order.
- **Globe frame is inert**: `h-[300px] rounded-2xl overflow-hidden` with a legend row below it. The reference boards put the intelligence *on* the map — passenger load, deviation callouts, vessel chips. Here the map is decorative and the data is elsewhere.

### 2.3 KPI strip — `Kpi()`

- **Eight metrics, identical weight.** `metric-value` (clamp 1.625→2rem, 650) on all eight. R$ 2.4M and "3 alertas" are typographically equal. They are not equal.
- **Colour is decorative, not semantic.** `mint / cyan / blue / orange` assigned per-card with no rule — "Duração média" is blue, "Custo médio" is blue, "Custo no período" is cyan. A reader cannot learn the system because there isn't one.
- **No trend, anywhere.** Eight numbers, zero deltas, zero sparklines. An executive cannot answer "is this good?" — the single most important question a KPI must answer. `KpiSparkline.jsx` already exists in the codebase and is unused here.
- **`detail` line is doing three unrelated jobs**: a secondary metric ("3 multimodais"), a denominator ("48 confirmadas"), a methodology note ("vs. alternativas"), and a unit label ("colaboradores"). Four semantics, one style.
- **Hairline `border-l` grid** inside a `surface-recessed` block reads as a spreadsheet, not as widgets — and it breaks at the 2-col mobile wrap (`border` prop is index-based, not position-aware).
- **Only 4 of 8 are clickable.** Inconsistent affordance; nothing signals which.

### 2.4 Filters row

- **A bare `<input type="date">`** — renders the raw OS date widget, which will never look premium and is visually inconsistent across Chrome/Safari. The project already ships `DatePicker.jsx` and `react-day-picker`.
- **A bare `<select>`** with `glass-input` — same problem: native dropdown, native chevron, native option list on a dark glass field.
- **Six controls in an undifferentiated `flex-wrap gap-3` row.** No grouping (time vs. scope vs. state), no labels, no visible field names when empty — the placeholder disappears the moment a value is selected, so the user loses the semantics of their own filter.
- **No active-filter feedback** beyond a count in the reset link. No chips, no "48 de 213 mobilizações" result summary.
- **Loses its meaning as it scrolls away.** In an analysis dashboard the filter state must persist visually.

### 2.5 Analytics below the fold

- **Panel monotony.** Ten `Panel` instances, each: 1px gradient top-line, 8×8 rounded icon tile, `heading` + 12px subtitle, optional action. It's a strong component used ten times in a row, so its strength becomes wallpaper.
- **The accent-per-panel rule is arbitrary.** `mint / orange / cyan / purple / white / orange / mint / purple / mint / cyan` — random, so it teaches nothing and just adds chroma noise.
- **`CategoryBars` uses the 5-hue rotating sequence** for what is a *single-dimension magnitude comparison*. Categories of one measure should be one hue at varying weight, or ranked neutral. Rotating hue here is the classic "AI dashboard" tell.
- **Top-20 collaborators table** colours "Mão de obra" purple and "Transporte" cyan. Two arbitrary hues inside a dense numeric table hurt scanning; alignment and weight should do that work.
- **"Conformidade & exposição"** is four `Row`s and a disclaimer that says the real data is elsewhere. It's a placeholder wearing a panel.
- **Three-across final row** of unrelated cards (Modal mix / Savings / Compliance) is a dumping ground, and the closing note reads as an apology.
- **No table affordances**: no sort, no column config, no pagination, no CSV export, no row density — on tables in an enterprise product.

### 2.6 System-level

- **Font**: Outfit was pulled from **Google Fonts in `index.html`** (render-blocking, plus two preconnects) and hardcoded into nine `index.css` utility classes — while **Geist was bundled via `@fontsource-variable/geist`, self-hosted, and never actually used**. So the app paid for two fonts and rendered the wrong one. Outfit is a geometric display sans with a single-storey `a` — friendly, editorial, and the wrong voice for dense operational data. Your reference calls for a neo-grotesk.
- **`src/styles/` is entirely dead code.** `variables.css`, `base.css` and `components.css` (2,237 lines total) are imported by nothing — `main.jsx` loads only `index.css`. The design tokens they define, including a *different* colour palette and radius scale, have no effect. This is a meaningful source of confusion for anyone reading the codebase to understand the design system.
- **Radius drift**: `rounded-lg` (8) / `rounded-xl` (12) / `rounded-2xl` (16) / `premium-panel` 1rem / `--radius-2xl` 32 / `rounded-full`, mixed within the same card.
- **Opacity soup**: `white/[0.02] .03 .04 .05 .06 .07 .08 /15 /25 /30 /35 /40 /45 /50 /65 /70 /75 /90`. Nineteen ad-hoc alpha values doing the job of a 4-step ink ramp — this is the main reason the UI reads as flat and muddy.
- **`--bg-primary: #040A0A` / `--bg-secondary: #081A15`** are green-tinted blacks. Against a warm amber accent they'll look sickly. The reference black is `#040505` — neutral.

---

# 3. Proposed information architecture

## 3.1 The governing principle

Three zones, in descending order of *time-sensitivity*, each with a **visually distinct treatment** so the user knows what kind of thinking is required:

```
┌────────────────────────────────────────────────────────────────┐
│  ZONE A — COMMAND          "What is happening right now?"      │
│  Live · dark canvas · glass overlays · glow allowed            │
│  Refresh: streaming            Audience: dispatcher / ops lead  │
├────────────────────────────────────────────────────────────────┤
│  ZONE B — POSITION          "Where do we stand this period?"   │
│  Filtered · flat panels · no glow · high contrast              │
│  Refresh: on filter change     Audience: ops manager            │
├────────────────────────────────────────────────────────────────┤
│  ZONE C — LEDGER            "Show me the underlying records."  │
│  Tabular · dense · sortable · exportable · zero decoration     │
│  Refresh: on filter change     Audience: analyst / controller   │
└────────────────────────────────────────────────────────────────┘
```

The current page interleaves all three. That's the structural fix.

## 3.2 Full page map

```
NAV (56px, sticky)
  ├ mark (32px) + "Insight Logistics" wordmark 15/600
  ├ nav: Dashboard · Colaboradores · Simulação · Rotas · Mobilização · Histórico
  └ right: [⌘K search] [status: LIVE 14:32:07] [alerts ●3] [avatar]
     ("Configurações" moves into the avatar menu — it is not a peer of Dashboard)

╔═ ZONE A — COMMAND ═══════════════════════════════════════════════╗
│ HERO CANVAS  (full-bleed, 560px, globe = background layer)
│   ┌ TL overlay ─ eyebrow "CONTROL TOWER · MOBILIZAÇÕES CONFIRMADAS"
│   │              h1 24/600 "Centro de Comando"
│   │              sub 14 "18 operações ativas · 142 colaboradores em trânsito"
│   ├ TR overlay ─ [◉ AO VIVO 14:32:07]  [Nova Análise ▸]
│   ├ BL overlay ─ PRIMARY METRIC BLOCK (glass)
│   │              Custo no período  R$ 2.480.150   ▲ 8,2% vs. anterior
│   │              + 44px sparkline
│   │              3 supporting: Ativas · Custo médio · Economia
│   ├ BR overlay ─ LIVE OPERATIONS FEED (glass, scrollable, max 5)
│   │              per row: status dot · projeto · rota · ETA · modal
│   ├ B-centre  ─ status legend + map controls (+ / ⌖ / −) + layer toggle
│   └ selection ─ clicking an arc opens an on-canvas detail card (ref. board 3)
│
│ OPERATIONAL CHIP RAIL (below canvas, 4 compact)
│   Duração média · No prazo · Em trânsito · Alertas
╚══════════════════════════════════════════════════════════════════╝

═ FILTER BAR (sticky under nav once Zone A scrolls past) ═
   [Período ▾]  |  [Projeto ▾] [Modal ▾] [Origem ▾]  |  [Status ▾]  |  ↺
   active chips + "Exibindo 48 de 213 mobilizações confirmadas"

╔═ ZONE B — POSITION ══════════════════════════════════════════════╗
│ ROW 1   Evolução de custos (8) ─────────────── Composição (4)
│         area + cost/mob line, brushable       donut + ranked legend
│ ROW 2   Gasto por projeto (5) ──────── Alertas & SLA (3) ── Economia (4)
│         ranked bars + Δ                triage list         big + method
╚══════════════════════════════════════════════════════════════════╝

╔═ ZONE C — LEDGER ════════════════════════════════════════════════╗
│ Tabbed single table surface — one container, three datasets:
│   [ Mobilizações ativas (18) ] [ Colaboradores (20) ] [ Projetos (12) ]
│   sortable · density toggle · column config · CSV · row → drawer
╚══════════════════════════════════════════════════════════════════╝

FOOTER STRIP
   Fonte: mobilizações confirmadas · última sync 14:32:07 · cobertura 94% · v2.0
```

## 3.3 Metric hierarchy (replaces the flat 8)

| Tier | Metric | Treatment |
|---|---|---|
| **Primary** | Custo no período | 48px / 600 / tabular, on-canvas glass, delta + 44px sparkline |
| **Supporting** ×3 | Ativas · Custo médio · Economia | 28px / 600, delta chip, inline |
| **Operational** ×4 | Duração média · No prazo · Em trânsito · Alertas | 20px / 600, chip rail, icon + label inline |

**Rationale:** *Custo no período* is the number this product exists to control. *Economia* is the number that justifies the product. Those two carry the page. "Duração média" is a diagnostic, not a headline — it belongs in the chip rail.

---

# 4. Visual redesign plan

## 4.1 Zone A — the command canvas

The decisive change: **the globe stops being a panel and becomes the page's ground plane.**

```
╭──────────────────────────────────────────────────────────────────╮
│ ·CONTROL TOWER · MOBILIZAÇÕES CONFIRMADAS·        ◉ AO VIVO 14:32│
│  Centro de Comando                              [ Nova Análise ▸]│
│  18 operações ativas · 142 colaboradores                         │
│                                                                  │
│                    ╭─ SÃO PAULO ─╮                               │
│              ╭─────┤  6 ativas   ├──────╮      ← on-canvas HUD   │
│              │     ╰─────────────╯      │        callout, glass  │
│         ~~~~~●~~~~~~~~~~~~~~~~~~~~~~~~~~●~~~~                    │
│              ╲   amber arc, animated dash   ╱                    │
│                                                                  │
│ ╭─ glass ────────────────────╮   ╭─ glass ──────────────────────╮│
│ │ CUSTO NO PERÍODO           │   │ OPERAÇÕES AO VIVO         ⟳ ││
│ │ R$ 2.480.150               │   │ ● Petro-Sul  GRU→SSA  2h14  ││
│ │ ▲ 8,2%  vs. período ant.   │   │ ● Vale-N     CGH→BSB  0h48  ││
│ │ ╱╲__╱╲___╱╲__ sparkline    │   │ ▲ Braskem    VCP→REC  atras.││
│ │ ─────────────────────────  │   │ ● Norte-3    CNF→FOR  4h02  ││
│ │ Ativas 18 │ Médio R$51k │  │   │ ● Enseada    SDU→POA  1h30  ││
│ │ Economia R$312k ▲         │   │        ver todas (18) →      ││
│ ╰────────────────────────────╯   ╰──────────────────────────────╯│
│      ● Em rota ● Em trânsito ● Atenção ● Atrasada    [+][⌖][−]   │
╰──────────────────────────────────────────────────────────────────╯
  ┌────────────┬────────────┬────────────┬────────────┐
  │ ⏱ 8h24     │ ◎ 94,2%    │ ⇄ 142      │ ⚠ 3        │
  │ DURAÇÃO M. │ NO PRAZO   │ EM TRÂNSITO│ ALERTAS    │
  └────────────┴────────────┴────────────┴────────────┘
```

**Canvas spec**
- Height `clamp(480px, 52vh, 620px)`, full container width, radius `20px`, `overflow: hidden`.
- Cesium/Deck sits at `z-0`, absolutely positioned, `inset: 0`.
- **Vignette layer** `z-1`, `pointer-events-none`:
  `radial-gradient(120% 100% at 50% 40%, transparent 30%, #040505 88%)` — this is what makes the overlays legible and is the single biggest realism win. The reference board does exactly this.
- **Top scrim** for the header overlays: `linear-gradient(180deg, rgba(4,5,5,.72) 0%, transparent 40%)`.
- Overlays at `z-2`, `pointer-events: auto` on children only.
- Ambient title treatment (optional, ref. board 1): `Centro de Comando` at 72px, `rgba(255,255,255,0.045)`, sitting *behind* the map at `z-0`, above the canvas background. Atmosphere, not text.

**Globe styling** (`CesiumHudGlobe.jsx` / `HudGlobe.jsx`)
- Terrain to near-monochrome: desaturate the imagery layer, lift only water to a cool `#0A1418`. The reference map is 95% greyscale with *one* saturated element — the route.
- Route arcs: amber `#F39444`, 1.5px core + 6px blur halo at 22% alpha, animated dash `stroke-dasharray: 8 12` with `dashoffset` marching at 1.2s linear infinite.
- Endpoint markers: 5px filled dot + 14px ring at 30% alpha, pulsing only on `in_transit`.
- Status → colour: `on_track #F39444` · `in_transit #F8F8F8` · `warning #E0A458` · `delayed #FF0000`. **Four states, three hues** — red only for `delayed`.
- HUD callout card on hover/select: glass, 12px radius, 11px `label-micro` header + 20px value, 1px `rgba(248,248,248,.12)` border, no glow.

**Primary metric block** — the composition that carries the page:
```
CUSTO NO PERÍODO                    ← 11/600/0.14em, ink-3
R$ 2.480.150                        ← 48/600/-0.03em, tabular, ink-0
▲ 8,2%  vs. período anterior        ← 13/500, amber chip + ink-3
[───── 44px sparkline, amber ─────]
────────────────────────────────    ← 1px hairline, ink-line
Ativas 18 │ Médio R$ 51k │ Econ. R$ 312k ▲
```

## 4.2 Zone B — analysis panels

Deliberately **calmer** than Zone A. This is where the current design's instinct to decorate must be fully suppressed.

- **No glow. No gradient top-line. No coloured icon tile.** Panel header is: 15/600 title, 13/400 ink-3 subtitle, right-aligned action link. That's it.
- Surface: `--surface-2` flat fill, 1px `ink-line` border, 16px radius, 24px padding. **One panel style, used everywhere.**
- The 1px gradient hairline is retained **only on Zone A overlays**, where it signals "live."
- Charts get generous internal padding (24px) and no chart-level borders — the panel is already the frame.

## 4.3 Zone C — the ledger

One tabbed surface replacing three separate tables. Tabs are underlined text, not pills — pills are reserved for nav.

- Header row: 11px `label-micro`, ink-3, sticky, 1px bottom border, sortable with a caret that only appears on hover/active.
- Rows: 44px (comfortable) / 36px (compact, via density toggle), hairline `rgba(248,248,248,.05)` separators, hover `rgba(248,248,248,.03)`.
- Numeric columns: `tabular-nums`, right-aligned, **no colour** except the final total (ink-0 600).
- Status: 6px dot + 12px label, colour from the four-state map.
- Row click → existing drawer. Add `⌘/Ctrl+click` → new tab where a route exists.
- Toolbar: search · density · columns · CSV export · row count.

---

# 5. Design system direction

## 5.1 Typography

**Replace Outfit with a neo-grotesk.** Outfit's geometric single-storey `a` and wide round forms are editorial; they undercut credibility in dense operational data. Per your reference: Helvetica Neue — or, for a variable, licence-clean, hinted-for-screen equivalent already in your dependency tree:

**Recommendation: keep `@fontsource-variable/geist` (already installed, currently imported but unused) and drop Outfit.** Geist is a neo-grotesk in the Helvetica/Inter lineage, variable, and screen-optimised. This removes a dependency instead of adding one. If brand mandates true Helvetica Neue, the stack below swaps cleanly — the scale is unchanged.

```css
--font-sans: 'Geist Variable', 'Helvetica Neue', Helvetica, -apple-system, sans-serif;
--font-mono: 'Geist Mono Variable', ui-monospace, 'SF Mono', monospace;
```

**Scale** — 7 steps, no more. Every current class maps onto one of these.

| Token | Size / LH | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 48 / 1.0 | 600 | −0.03em | The one primary metric |
| `metric` | 28 / 1.05 | 600 | −0.02em | Supporting metrics |
| `metric-sm` | 20 / 1.1 | 600 | −0.01em | Chip rail, stat blocks |
| `title` | 15 / 1.3 | 600 | −0.01em | Panel + section headers |
| `body` | 13 / 1.5 | 400 | 0 | Table cells, descriptions |
| `body-sm` | 12 / 1.45 | 400 | 0 | Secondary / metadata |
| `label` | 11 / 1.1 | 600 | **0.14em** | Uppercase eyebrows, table heads, axes |

**Rules**
1. All numerals: `font-variant-numeric: tabular-nums` — *globally*, not per-class. Columns of money must align.
2. Tracking `0.14em`, not `0.16em` — at 11/600 the current value over-opens and reads decorative.
3. **Never** gradient-fill text. Delete `.text-gradient-premium` from the dashboard.
4. Weight range is **400 / 500 / 600 only**. Drop `650` (a variable-font artefact that renders inconsistently on fallback).
5. `h1` on the dashboard is "Centro de Comando" at `title`+ (24px), *not* the product name.

## 5.2 Colour

### The brand decision you need to make

Your app is currently mint-green (`#49DC7A` — logo glow, nav beam, every positive value, chart-1). Your reference palette is amber `#F39444`. **These cannot both be the primary accent.** Recommendation:

> **Amber `#F39444` becomes the interface accent** — active states, focus rings, the primary metric, route arcs, primary CTA.
> **Mint `#49DC7A` is demoted to a pure semantic** — positive delta, on-time, savings-positive. Nothing else.
> Cyan, violet, magenta, blue and purple are **removed from the UI entirely** and survive only inside multi-series charts, at reduced saturation.

This preserves brand recognition (mint still means "good", the logo is untouched) while giving the interface the single controlled accent the reference demands. It also fixes the green-tinted black.

### Tokens

```css
/* ── Canvas — neutral, not green-tinted ── */
--canvas:        #040505;   /* page ground (ref. #040505) */
--surface-1:     #0A0B0C;   /* zone background */
--surface-2:     #101113;   /* panel */
--surface-3:     #17181B;   /* recessed / table header / input */
--surface-glass: rgba(16,17,19,0.72);  /* Zone A overlays only */

/* ── Ink — 5 steps, replaces 19 ad-hoc alphas ── */
--ink-0: #F8F8F8;                    /* primary values, headings */
--ink-1: rgba(248,248,248,0.72);     /* body, table cells */
--ink-2: rgba(248,248,248,0.48);     /* secondary, subtitles */
--ink-3: rgba(248,248,248,0.30);     /* labels, axes, metadata */
--ink-line: rgba(248,248,248,0.08);  /* borders, separators */
--ink-line-strong: rgba(248,248,248,0.14);

/* ── Accent — one ── */
--accent:        #F39444;
--accent-hover:  #F7A55E;
--accent-press:  #DE7F30;
--accent-soft:   rgba(243,148,68,0.12);   /* fills, chip bg */
--accent-line:   rgba(243,148,68,0.28);   /* borders */
--accent-glow:   rgba(243,148,68,0.22);   /* Zone A only */

/* ── Semantic — three, strictly scoped ── */
--positive: #49DC7A;   /* ▲ savings, on-time. Delta + status only. */
--caution:  #E0A458;   /* at-risk. Warm, deliberately near accent. */
--critical: #FF0000;   /* delayed / failed / breach. Nothing else. */
--neutral:  rgba(248,248,248,0.55);

/* ── Charts — one hue family + one contrast ── */
--chart-1: #F39444;   /* primary series */
--chart-2: #C97A3B;
--chart-3: #9E6234;
--chart-4: #6E4A2C;
--chart-5: #F8F8F8;   /* comparison / benchmark line */
--chart-grid: rgba(248,248,248,0.05);
```

### The 60/30/10 discipline

| Share | Role | Colours |
|---|---|---|
| **60%** | Ground | `--canvas`, `--surface-1/2/3` |
| **30%** | Information | `--ink-0` → `--ink-3` |
| **10%** | Signal | `--accent`, then `--positive` / `--caution` / `--critical` |

If a screenshot shows more than ~10% chroma, cut. The current dashboard is at roughly 35%.

### Red discipline
`#FF0000` is pure red — extremely loud by design. Permitted uses, exhaustively: `status === 'delayed'`, `severity === 'high'`, SLA breach, destructive confirmation. If more than **two** red elements are visible simultaneously, red has stopped meaning "critical."

## 5.3 Spacing & grid

**4px base.** Only these values exist: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. (Deletes 20, 40, 56 from current usage.)

- Grid: **12 columns**, gutter **24px**, page padding `clamp(24px, 4vw, 48px)`, max-width **1600px**.
- Vertical rhythm: **32px** between panels within a zone, **48px** between zones. (Current uniform `space-y-6` = 24px is why zones don't read as separate.)
- Panel padding: **24px** standard, **20px** compact, **32px** hero overlays.
- Breakpoints: `≥1600` full · `1280–1599` 12-col, Zone B rows collapse 8/4 → 7/5 · `1024–1279` canvas 480px, overlays stack, chip rail 4-across · `<1024` canvas → static map image + list, everything single column.

## 5.4 Cards & surfaces

**Three card recipes. No fourth.**

```css
/* 1. Panel — Zone B & C. The default. Flat, quiet. */
.panel {
  background: var(--surface-2);
  border: 1px solid var(--ink-line);
  border-radius: 16px;
  padding: 24px;
  /* no shadow, no glow, no gradient */
}

/* 2. Glass — Zone A overlays ONLY. Earns its cost by sitting on the map. */
.glass {
  background: var(--surface-glass);
  backdrop-filter: blur(24px) saturate(1.2);
  border: 1px solid var(--ink-line-strong);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 16px 48px -12px rgba(0,0,0,0.6),
              inset 0 1px 0 rgba(248,248,248,0.06);
}

/* 3. Inset — nested blocks inside a panel. */
.inset {
  background: var(--surface-3);
  border-radius: 12px;
  padding: 16px;
}
```

**Radius scale**: `8` (chips, inputs) · `12` (inset, buttons) · `16` (panel, glass) · `20` (canvas) · `999` (dots, pills). Nothing else. Nested radius must always be *smaller* than its parent.

**Border > shadow.** On dark, shadows read as mud. One hairline border does the separation job at a fraction of the visual cost. Shadow appears only on `.glass` and floating layers (drawer, dropdown, tooltip).

**Glow budget**: `--accent-glow` may appear on **at most three** elements per viewport, all in Zone A: the live pulse, the active route arc, the primary CTA hover. Zone B and C have a **glow budget of zero**.

## 5.5 Iconography

- **Lucide, 1.5px stroke, 16px default** (20px only in the chip rail, 14px in table cells). Current mix of `strokeWidth 2 / 2.5` at sizes 12–22 is inconsistent and reads chunky at small sizes.
- **Kill the coloured icon tile.** The `w-8 h-8 rounded-xl bg-{accent}/[0.08]` container on every panel header adds 10 chroma blocks to the page for zero information. Icons in Zone B are bare, `--ink-3`, inline with the title.
- Icons are `--ink-3` by default. They take `--accent` **only** when their element is active/selected.
- Never an icon without a text label except in: the chip rail, table status cells, and map controls.
- Directional deltas use `▲ ▼` glyphs (or a 10px chevron), not full arrow icons — they belong to typography, not iconography.

## 5.6 Charts

| Rule | Detail |
|---|---|
| **Single-measure = single hue** | `CategoryBars`, project ranking, collaborator spend → `--accent` at 100/85/70/55/40% opacity by rank, *not* 5 rotating hues. This is the highest-impact single chart fix. |
| **Multi-series = amber family + white** | Max 4 series. If more are needed, the chart is wrong — use a ranked list. |
| **Grid** | Horizontal only, `--chart-grid`, 1px. No vertical grid. No axis lines. |
| **Axes** | `label` token, `--ink-3`. Y-axis abbreviated (`R$2,4M`), max 5 ticks. X-axis max 7 labels, auto-thinned. |
| **Area fill** | `linear-gradient(180deg, rgba(243,148,68,0.18) 0%, transparent 100%)`, stroke 2px solid. Never a filled solid area. |
| **Donut** | Inner radius ≥ 62% (thin ring, not a pie), 2° padding angle, **centre must carry the total** — currently empty. |
| **Bars** | 4px radius top only, 60% category width, no border. |
| **Sparklines** | 44px tall, 1.5px stroke, no axes, no dots except last point, gradient fade under. |
| **Tooltip** | `.glass` recipe, 12px radius, label + tabular value, 1px `--ink-line-strong`, follows cursor with 8px offset. |
| **Empty state** | Not the current `text-white/15` whisper — an inset block with a 16px `--ink-3` icon, a 13px explanation, and a link to the action that would produce data. |
| **Loading** | Shimmer at chart dimensions, never a spinner, never a layout shift. |

## 5.7 Interaction

| Pattern | Spec |
|---|---|
| **Motion** | Micro `120ms`, small `200ms`, medium `320ms` — keep the existing tokens, they're good. Ease `cubic-bezier(0.22, 1, 0.36, 1)`. |
| **Hover** | Panels: none (they aren't interactive). Rows: `--surface-3` fill, 120ms. Cards that navigate: 1px border → `--ink-line-strong` + 2px lift. Never scale a card. |
| **Focus** | `outline: 2px solid var(--accent); outline-offset: 2px` — globally, visible, never removed. Currently missing on most custom controls. |
| **Drill-down** | Every aggregate number is a target. Consistent affordance: a `→` in `--ink-3` that goes `--accent` on hover. Opens the existing drawer. |
| **Live updates** | New feed row: 200ms fade + 4px slide-in. Changed metric: 320ms `--accent` flash on the *value only*, never the container. Never re-animate the whole page on poll. |
| **Loading** | Skeleton at true final dimensions. `App.jsx`'s `RouteFallback` already does this well — extend the pattern to in-page refetch. |
| **Filter feedback** | Zone B/C dim to `opacity: 0.5` for the duration of the fetch. Never blank, never spinner. |
| **Reduced motion** | Honour `useMotionPreference` — already wired. Extend it to: freeze route-arc dashes, disable the live pulse, kill `AnimatedNumber` counting. |
| **Keyboard** | `⌘K` search · `F` filters · `Esc` closes drawer · arrow keys navigate table rows · `Enter` opens drawer. |
| **Empty vs. zero** | `—` (em dash, `--ink-3`) means *no data*. `0` means *measured zero*. These are different and the current code conflates them in places. |

## 5.8 Microcopy

Shift from marketing to operations. Operators trust flat, specific language.

| Now | Redesign |
|---|---|
| "Centro de comando em tempo real · somente mobilizações confirmadas alimentam os indicadores" | "18 operações ativas · 142 colaboradores em trânsito" |
| "HUD · Mobilizações ao vivo" | "Operações ao vivo" |
| "Sem dados no período" | "Nenhuma mobilização confirmada neste período. Ajuste os filtros ou inicie uma mobilização." |
| "Inteligência de economia" | "Economia realizada" |
| "Conformidade & exposição" | "Composição operacional" |
| "vs. alternativas" | "vs. cenário não otimizado" |
| "Detalhar →" | "Ver composição →" |

Rules: no "inteligência", "premium", "HUD", "smart" in user-facing copy. State the fact. Units always visible. Every empty state names the action that fills it.

---

# 6. The improved dashboard, described

Loading the page, at 1440px:

**A 56px navigation bar** sits flush at the top on `--canvas` with a single hairline beneath — no floating pill, no glow. A 32px mark and the wordmark at 15/600 sit left. Six nav items in the centre at 13/500 `--ink-2`; the active item is `--ink-0` with a 2px amber underline flush to the bar's bottom edge. Right: a `⌘K` search field, a live status readout (`◉ AO VIVO · 14:32:07`, amber dot, `label` token), an alert bell with an amber count, and an avatar. Nothing in this bar competes with content.

**Below it, the canvas fills the viewport**: a near-monochrome globe over the Atlantic, South America desaturated to graphite, water a cool near-black. Amber arcs march between cities with animated dashes; endpoints pulse quietly. A vignette darkens the edges to `#040505` so the frame dissolves — you can't tell where the map ends.

Floating top-left: `CONTROL TOWER · MOBILIZAÇÕES CONFIRMADAS` at 11/600/0.14em `--ink-3`, then **Centro de Comando** at 24/600 `--ink-0`, then `18 operações ativas · 142 colaboradores em trânsito` at 14/400 `--ink-2`. Top-right: the live capsule and a single amber-outlined **Nova Análise** button.

Bottom-left, a glass block carries the page: `CUSTO NO PERÍODO` / **R$ 2.480.150** at 48px tabular / `▲ 8,2% vs. período anterior` in an amber chip / a 44px amber sparkline. A hairline, then three supporting figures inline: Ativas 18 · Médio R$ 51k · Economia R$ 312k ▲.

Bottom-right, a matching glass block: **OPERAÇÕES AO VIVO**, five rows — status dot, project, route, ETA — one of them amber-caution, "ver todas (18) →" beneath. Between them, the four-state legend and three circular map controls.

Directly under the canvas, a four-cell chip rail — Duração média 8h24 · No prazo 94,2% · Em trânsito 142 · Alertas 3 — at 20/600, bare `--ink-3` icons, dividing hairlines, and only the alert chip carrying amber because it's non-zero.

**48px of space.** Then the filter bar: three visually grouped clusters (time · scope · state) separated by hairlines, each control a proper `.inset` field with a persistent label above the value. To the right, `Exibindo 48 de 213 mobilizações confirmadas` and a reset. It sticks below the nav once the canvas scrolls away.

**Zone B arrives noticeably calmer** — flat `--surface-2` panels, hairline borders, no glow, no coloured tiles. Evolução de custos spans 8 columns: an amber area chart with a white benchmark line, horizontal grid only, brushable. Composição takes 4: a thin donut with the total in its centre and a ranked legend where each category shows value, share, and delta. The second row runs 5/3/4: ranked project bars in single-hue amber, an alert triage list where exactly one item is red, and Economia realizada with a large `--positive` figure over its methodology.

**Zone C is one surface**, three tabs, no decoration: dense sortable rows, tabular numerals, right-aligned money, hairline separators, hover fill, click-to-drawer. A toolbar offers search, density, columns and CSV.

**A footer strip** in `label`/`--ink-3`: `Fonte: mobilizações confirmadas · última sync 14:32:07 · cobertura do cálculo 94% · v2.0`.

The page reads as: *a live operations picture, then a filtered position, then the records.* Three modes of attention, three visual treatments, one accent.

---

# 7. Block-by-block recommendations

### 7.1 Navigation — `src/components/ui/TubelightNavbar.jsx`

- Logo `240px → 32px mark + wordmark`. Kill the `drop-shadow` glow.
- Replace `absolute left-1/2` centring with a three-region flex (`logo | nav flex-1 justify-center | actions`). This is the actual collision fix.
- Bar: `position: sticky; top: 0; height: 56px; background: rgba(4,5,5,0.82); backdrop-filter: blur(20px); border-bottom: 1px solid var(--ink-line)`. Not a floating pill.
- Active state: `--ink-0` text + 2px amber underline via `layoutId="nav-active"` (keeps the Framer shared-layout animation, drops the white pill and the tubelight beam).
- Move **Configurações** into the avatar menu. Add `⌘K` search, live status readout, alert bell.
- `Simulação Mobilização` → **`Simulação`**; `Inteligência de Rotas` → **`Rotas`**. Shorter labels are the other half of the collision fix.

### 7.2 Hero canvas — `Dashboard.jsx` §hero + `CesiumHudGlobe.jsx`

- Delete `premium-panel-hero`, both blurred blobs, and `text-gradient-premium`.
- New `<CommandCanvas>` component: globe `z-0` → vignette `z-1` → overlay grid `z-2`.
- Product name leaves the hero; page title becomes "Centro de Comando".
- Desaturate imagery; restyle arcs per §4.1; add hover/select HUD callout.
- Add the live-operations feed overlay (data already exists as `data.map`).
- Legend moves onto the canvas; add map controls (`+ / ⌖ / −`).
- Ensure globe canvas is `pointer-events: auto` while overlays are `none` except on their interactive children.

### 7.3 KPIs — `Kpi()`

- Split into three components: `<PrimaryMetric>`, `<SupportingMetric>`, `<OperationalChip>`. The current single component enforcing eight identical cells is the root cause.
- Add `delta` + `deltaDirection` to every metric — the backend already computes period aggregates; extend `DashboardService` to return the previous-period comparison.
- Wire the existing unused `KpiSparkline.jsx` into `<PrimaryMetric>`.
- Remove the `color` prop entirely. Colour is derived from semantics: value → `--ink-0`, positive delta → `--positive`, negative → `--caution`, breach → `--critical`.
- Every metric is clickable → drawer. Consistent `→` affordance on hover.
- Delete the `border` prop; use CSS `:not(:first-child)` separators so it survives responsive wrapping.

### 7.4 Filters

- Replace `<input type="date">` with the existing `DatePicker.jsx` in a single **range** control with presets (7d · 30d · 90d · Mês atual · Personalizado).
- Replace `<select>` with a Base UI Select styled as `.inset` — the project already depends on `@base-ui/react`.
- Group into three clusters with hairline separators: **time** | **scope** (projeto, modal, origem) | **state** (status).
- Persistent label above each field so semantics survive selection.
- Active filters render as removable amber chips; add the result summary `Exibindo 48 de 213`.
- Sticky under the nav; persist to URL query params so filtered views are shareable — a genuine enterprise expectation and currently absent.

### 7.5 Evolução de custos

- Add a secondary white line: **custo por mobilização** — volume-adjusted cost is the insight; total cost alone is not.
- Add a brush/range selector under the chart.
- Add granularity toggle (dia / semana / mês) in the header.
- Annotate anomalies: a small amber marker on any day exceeding 2σ, with a tooltip naming the driver.

### 7.6 Gasto por categoria — `CategoryBars()`

- Single-hue amber ramp by rank. **Delete `CHART_SEQUENCE` from this component** — this one change removes the strongest "generic AI dashboard" signal on the page.
- Add a period-over-period delta per category.
- Show absolute + share, right-aligned, tabular.
- Track height 6px, radius 3px, `--surface-3` background.

### 7.7 Gasto por projeto

- Convert the list to ranked horizontal bars — bar length beats reading twelve numbers.
- Rank badge in `--ink-3`, not a bordered tile.
- Add "% do total" and a delta chip.
- Cap at 8 with "ver todos (12) →".

### 7.8 Top-20 colaboradores

- Move into Zone C as a tab. It's a ledger, not an analysis panel.
- Remove the purple/cyan column colours — use alignment and weight.
- Add sort, CSV, and a 24px avatar/initial per row.
- Stacked micro-bar in the total column showing labor vs. transport split — the colour-coding intent, done correctly.

### 7.9 Mobilizações ativas

- Move into Zone C as the default tab.
- Add ETA countdown (`em 2h14`) rather than a raw timestamp — operationally more useful.
- Add a progress column: 3px track with amber fill at `progressPercentage`.
- Row hover previews the route on the canvas above (scroll-linked highlight) — a high-value, low-cost link between zones.

### 7.10 Alertas

- Group by severity with counts; critical first.
- Each alert carries: severity dot · message · affected mobilization link · elapsed time · a resolve action.
- Only `severity: high` uses `--critical`. Medium uses `--caution`. Low is neutral.
- Empty state: a `--positive` check with "Nenhum alerta ativo · última verificação 14:32".

### 7.11 SLA / Economia / Conformidade

- Merge SLA into the Alerts panel — they answer the same question.
- **Economia realizada**: large `--positive` figure, methodology as a subtitle, coverage as a thin progress bar, top-3 contributing projects.
- **Conformidade & exposição** in its current form should be cut or filled with real data. Four `Row`s plus "detailed elsewhere" is a placeholder. If HE/noturno data exists, chart it; if not, remove the panel — an honest gap beats a decorated one.

### 7.12 Tokens — `src/styles/variables.css` + `src/index.css`

- Replace the colour block with §5.2 wholesale.
- Delete `'Outfit'` from all nine hardcoded utility classes; point `--font-sans` at Geist.
- Collapse the type utilities to the seven tokens in §5.1.
- Introduce the 5-step ink ramp and **migrate every `white/[0.0x]` to it**. This is mechanical, high-volume, and delivers the largest perceptual gain per line changed.
- Delete `.text-gradient-premium`, `.premium-panel-mint/orange/purple`, `.premium-panel-hero`.
- Add `font-variant-numeric: tabular-nums` to `:root`.

---

# 8. Implementation brief

## 8.1 Sequencing

Ordered by *perceptual gain per hour*. Phases 1–2 alone close most of the "AI-generated" gap.

| Phase | Scope | Files | Est. |
|---|---|---|---|
| **1 — Tokens** | Colour system, ink ramp, type scale, font swap, radius/spacing normalisation. No layout change. | `variables.css`, `index.css`, `tailwind.config.js` | 1–1.5d |
| **2 — Decoration removal** | Delete gradient text, per-panel accents, coloured icon tiles, blob glows, panel top-lines. Single-hue `CategoryBars`. | `Dashboard.jsx`, `index.css`, `charts/*` | 0.5d |
| **3 — Navigation** | Three-region sticky bar, underline active state, shortened labels, search/status/alerts cluster. | `TubelightNavbar.jsx`, `App.jsx` | 1d |
| **4 — Command canvas** | `<CommandCanvas>`, vignette, overlay grid, globe restyle, live feed, HUD callout. | new `components/dashboard/CommandCanvas.jsx`, `CesiumHudGlobe.jsx`, `HudGlobe.jsx` | 2–3d |
| **5 — Metric hierarchy** | Split `Kpi` into three components, deltas, sparkline, universal drill-down. | new `components/dashboard/metrics/*`, `useDashboard.js`, `DashboardService` | 1.5d |
| **6 — Filter bar** | Range picker, Base UI selects, clustering, chips, URL sync, sticky. | new `components/dashboard/FilterBar.jsx`, `DatePicker.jsx` | 1.5d |
| **7 — Zone B** | Flat panel component, chart restyle, brush, granularity, deltas. | `Dashboard.jsx`, `charts/*` | 2d |
| **8 — Zone C** | Tabbed ledger, sort, density, columns, CSV, keyboard nav. | new `components/dashboard/Ledger.jsx`, `DataTable.jsx` | 2d |
| **9 — Polish** | Focus rings, reduced motion, empty states, microcopy, responsive audit. | across | 1d |

**Total ≈ 13–15 developer-days.**

## 8.2 Component inventory

```
src/components/dashboard/
├─ CommandCanvas.jsx          globe + vignette + overlay slots
├─ canvas/
│  ├─ CanvasHeader.jsx        eyebrow · title · subtitle · live · CTA
│  ├─ PrimaryMetricBlock.jsx  glass · 48px value · delta · sparkline · 3 supporting
│  ├─ LiveOperationsFeed.jsx  glass · scrollable · 5 rows · "ver todas"
│  ├─ CanvasLegend.jsx        4 status states
│  ├─ CanvasControls.jsx      + / ⌖ / − / layers
│  └─ RouteCallout.jsx        hover/select HUD card
├─ OperationalChipRail.jsx    4 compact chips
├─ FilterBar.jsx              3 clusters · chips · summary · URL sync
├─ metrics/
│  ├─ PrimaryMetric.jsx
│  ├─ SupportingMetric.jsx
│  ├─ OperationalChip.jsx
│  └─ DeltaChip.jsx           ▲/▼ · % · semantic colour
├─ panels/
│  ├─ Panel.jsx               flat · no accent prop
│  ├─ CostEvolution.jsx
│  ├─ CostComposition.jsx
│  ├─ ProjectRanking.jsx
│  ├─ AlertTriage.jsx         alerts + SLA merged
│  └─ SavingsPanel.jsx
└─ Ledger.jsx                 tabs · toolbar · DataTable
```

## 8.3 Backend additions required

`DashboardService` must additionally return:

```ts
overview.previousPeriod: {          // enables every delta chip
  totalSpendMinor, averageSpendMinor,
  activeMobilizations, estimatedSavingsMinor,
  onTimeRate, activeEmployeesInTransit
}
overview.sparkline: number[]        // ~30 points, primary metric
categorySpend[].deltaPercent        // period-over-period
projectSpend[].deltaPercent
trend[].costPerMobilizationMinor    // the secondary series
alerts[].mobilizationId             // makes alerts navigable
alerts[].createdAt                  // elapsed-time display
map[].progressPercentage            // already present — surface it
```

Period comparison rule: same duration, immediately preceding, same filters. Return `null` (→ `—`) when insufficient history, never `0`.

## 8.4 Definition of done

- [ ] Zero `white/[0.0x]` literals remain in `Dashboard.jsx`; all colour flows from tokens.
- [ ] `'Outfit'` appears nowhere in the codebase.
- [ ] A screenshot's chromatic pixels are ≲10% of the frame.
- [ ] Exactly one `display`-token number per viewport.
- [ ] Red appears only on `severity: high` / `status: delayed`; ≤2 instances visible at once.
- [ ] No glow outside the command canvas.
- [ ] Every aggregate number opens a drawer.
- [ ] Every metric shows a delta or an explicit `—`.
- [ ] Filter state is in the URL and survives reload.
- [ ] All interactive elements have a visible amber focus ring.
- [ ] `prefers-reduced-motion` freezes arcs, pulse, and number counting.
- [ ] Every empty state names the action that resolves it.
- [ ] Text contrast ≥ 4.5:1 (`--ink-2` and above); `--ink-3` used only for non-essential labels.
- [ ] 1024px viewport: no horizontal scroll, canvas degrades to static map + list.
- [ ] LCP < 2.0s with the globe lazy-loaded behind the SVG fallback.

## 8.5 Risks

| Risk | Mitigation |
|---|---|
| Mint→amber shift reads as off-brand | Mint remains in the logo and owns "positive". Prototype both accents on the hero and review side-by-side before Phase 1 lands. |
| Cesium restyle costs more than budgeted | Fall back to `DeckGLMap.jsx` with a monochrome basemap; the arc/HUD spec is renderer-agnostic. |
| Vignette + glass hurts frame rate | Vignette is a static CSS gradient, not a shader. Cap glass to two overlays. Test on integrated GPUs. |
| Previous-period data unavailable | Ship deltas as `—`; the layout reserves the space, so no visual regression. |
| Global token change breaks other pages | Phase 1 touches shared tokens — regression-check Collaborators, Comparator, RouteIntelligence, History, Settings in the same PR. |
```

---

# 9. Implementation status

## Landed — Phase 1 (tokens) + Phase 2 (decoration removal)

**Colour** — `src/index.css`
- Dark surface ladder retinted **true neutral** (`--page-base: 4 5 5` = `#040505`); the green/blue tilt that made warm amber read muddy is gone.
- `--ink: 248 248 248` (`#F8F8F8`, reference off-white).
- **`--color-accent` → `#F39444`** in both themes (light-mode `-text` darkened to `#924A14` for contrast on white).
- `--color-danger` → `#FF0000` core; `-text` lifted to `#FF6B6B` because pure red fails contrast as text.
- `--color-warning` → `#E0A458` (caution, deliberately adjacent to the accent).
- `--color-info` demoted to neutral slate — no longer a competing hue.
- Focus ring `--ring` → amber.
- **Ink ramp added**: `--ink-0/1/2/3`, `--ink-line`, `--ink-line-strong`, with a light-mode override that carries heavier alphas. Plus `--accent-solid/-soft/-line/-glow` and `--positive` / `--caution` / `--critical`.

**Charts** — `src/index.css`, `src/lib/chartTheme.js`
- The 5 chart hues desaturated to sit *under* the accent (`#f39444`, muted teal/violet/mauve, near-white benchmark). Still 5 distinguishable hues, because modal mix and RouteIntelligence are **genuinely categorical** — collapsing them to one hue would have destroyed real information.
- **`ACCENT_RAMP` + `accentByRank(i)` added** for single-measure magnitude charts.
- `CHART_PALETTE` gained semantic names (`primary` / `secondary` / `neutral` / `danger`); the old hue names are kept as aliases so nothing breaks.
- `getComparatorScenarioAccent` now returns **accent vs. neutral** instead of mint vs. amber — two saturated hues were blunting the "this is the recommendation" signal.

**Typography** — `src/index.css`, `index.html`, `tailwind.config.js`, 5 components
- Outfit removed everywhere; **Geist** (already a dependency, self-hosted) is now the stack, Helvetica Neue next.
- Deleted the Google Fonts `<link>` + 2 preconnects → one fewer render-blocking request.
- `--font-sans` moved onto `:root` (it was only on `.theme`, which is never applied) and a recursive `var()` fallback fixed.
- Scale retuned to the 7 tokens; weight `650` → `600`; `label-micro` tracking `0.16em` → `0.14em`; `.metric-value` de-clamped to a fixed 28px (the clamp made KPI numbers jitter on resize); `.metric-sm` added.
- `font-variant-numeric: tabular-nums` set globally on `html`.

**Components** — `src/index.css`, `src/pages/Dashboard.jsx`
- `.premium-panel-mint / -orange / -purple / -hero` **deleted**; replaced by three recipes: `.panel`, `.glass-panel`, `.inset-block`.
- `.text-gradient-premium` **deleted**.
- Global `:focus-visible` amber outline added — most custom controls previously had none.
- Hero: decorative shell, both blurred radial blobs, and the gradient wordmark removed. `<h1>` is now **"Centro de Comando"**; the subtitle carries live counts instead of restating the badge.
- `Panel`: the `accent` prop and its 5-hue lookup tables are gone, along with the coloured icon tile and the gradient top-line. Prop still accepted and ignored so call sites didn't have to change in the same commit.
- `Kpi`: the `color` prop is gone; values are ink-0, and colour appears only via `highlight`.
- `CategoryBars` now uses `accentByRank` — the single strongest "generic dashboard" tell on the page.
- Collaborator table's arbitrary purple/cyan money columns neutralised.
- Mint retained **only** as a positive semantic (`text-success-text` on Economia / No prazo / zero-alerts).

**Verification**: `npm run build` clean · `npm test` 192/192 · dev server 200 with the amber token compiled.

## Not yet done

Phases 3–9 (navigation, command canvas, metric hierarchy, filter bar, Zone B/C rebuilds, polish) are unstarted — those are the layout and IA work, ~11–13 days.

## Follow-ups this work surfaced

1. **Visual review required on the 6 non-dashboard pages.** The token change is global; Collaborators, Comparator, RouteIntelligence, MobilizationIntelligence, History and Settings compile and pass tests but have **not been looked at**. The tests are backend/domain and cover no styling.
2. **`src/styles/` (2,237 lines) is dead** — safe to delete, left in place because removing files was outside the ask.
3. **`Dashboard-*.js` is 1.19 MB** (392 kB gzipped) — Cesium is being pulled into the main dashboard chunk despite the `lazy()`. Worth a look during Phase 4.
4. **Legacy Tailwind hue aliases** (`accent-cyan`, `accent-purple`, `accent-blue`) now resolve to neutral ink so existing markup degrades gracefully. Call sites outside the dashboard should be migrated and the aliases deleted.
