---
name: ICRS Studio Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#006242'
  on-tertiary: '#ffffff'
  tertiary-container: '#007d55'
  on-tertiary-container: '#bdffdb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  display-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  code-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

The design system establishes an architectural, high-precision enterprise environment engineered for technical users, compliance operators, and data analysts. The aesthetic is rooted in Modern Utilitarian SaaS—balancing clinical exactitude with premium visual restraint.

### Brand Personality & Core Attributes
- **Architectural & Exact:** Every element adheres to an unyielding structural grid with pixel-exact boundaries, clear hierarchy, and high legibility.
- **Calm Authority:** Eliminates visual noise; uses neutral canvas planes to emphasize actionable data, states, and telemetry.
- **Instrument-Grade Feedback:** Affordances and states communicate instantly through disciplined color signaling and micro-transitions.

### Design Movement
The interface employs a hybrid of **Clean Precision SaaS** and **Tonal Layering**, pairing crisp pure-white surfaces with warm slate underlays, hairline boundary strokes, and restrained cobalt focal points.

## Colors

The palette operates on a strict light-mode tonal system calibrated for sustained data analysis, deep scanning, and enterprise workflows.

### Primary, Secondary & Status Accents
- **Primary Cobalt (`#2563eb`):** Primary interactions, active tabs, selected states, and focused rings. Carries high contrast against white and slate backgrounds.
- **Obsidian / Slate-900 (`#0f172a`):** Secondary structural accent, high-emphasis text, and dark pill badges.
- **Emerald Success (`#10b981`):** System health markers, positive deltas, valid telemetry, and completed run states.
- **Slate Neutral (`#64748b`):** Mid-tone labels, tertiary meta strings, inactive icons, and structural divider tokens.

### Surface System
- **Base Canvas (`#f8fafc` / Slate-50):** Global canvas foundation providing subtle warm-cool contrast behind cards.
- **Surface Elevation 1 (`#ffffff`):** Work surfaces, table panels, data cards, and interactive modal dialogs.
- **Surface Elevation 2 (`#f1f5f9` / Slate-100):** Table headers, inactive input fills, well containers, and segmented control tracks.
- **Structural Stroke (`#e2e8f0` / Slate-200):** 1px boundary lines defining panels, data cells, and toolbars.

## Typography

The typography uses Inter across display, body, and label roles to maintain systematic uniformity and rapid scanning across dense layouts.

### Usage Directives
- **High-Density Scaling:** `body-md` (14px/20px) serves as the primary operational scale for records, table data, and descriptions. `body-sm` (12px/18px) governs dense secondary values.
- **Labels & Micro-Copy:** `label-sm` utilizes an uppercase transformation with `letterSpacing: 0.04em` for section kicker titles, metric classifications, and column indicators.
- **Tabular Numerics:** Enable `font-feature-settings: "tnum" 1, "cv05" 1` across all data tables, telemetry readouts, timestamps, and metric dashboards to guarantee mono-alignment across numeric rows.

## Layout & Spacing

The layout leverages a disciplined 12-column responsive fluid grid pinned to an 8-point base coordinate system with 4-point micro-increments.

### Responsive Breakpoints
- **Desktop (≥ 1280px):** 12-column grid, `margin-lg` (32px), `gutter-lg` (24px). Dedicated fixed-width left rail (260px) alongside fluid analytical canvas.
- **Tablet (768px - 1279px):** 8-column grid, `margin-md` (24px), `gutter` (16px). Left rail collapses to an icon dock (64px) or off-canvas overlay.
- **Mobile (< 768px):** 4-column grid, `margin` (16px), `gutter` (16px). Cards stack vertically with auto-scrolling data overflow ribbons.

### Density Rules
- Components within data tables and operational grids default to compact vertical padding (`space-xs` and `space-sm`) to maximize visible information per viewport.
- Sectional grouping uses `space-xl` (24px) to preserve distinct boundaries without sacrificing screen density.

## Elevation & Depth

Visual hierarchy relies on structural hairline strokes (`#e2e8f0`) supplemented by soft, diffused shadows with low alpha and cool slate undertones.

### Layer Tiers
- **Level 0 (Flat Canvas):** `#f8fafc` background with 0px elevation. Used for app scaffolding and canvas regions.
- **Level 1 (Structural Cards & Tables):** Pure white `#ffffff` fill, 1px solid `#e2e8f0` border, `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02)`.
- **Level 2 (Dropdowns, Popovers & Context Menus):** Pure white `#ffffff` fill, 1px solid `#e2e8f0`, `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
- **Level 3 (Modals & Command Palettes):** Pure white `#ffffff` fill, 1px solid `#cbd5e1`, `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.03)`. Backdropped by `rgba(15, 23, 42, 0.4)` with 4px backdrop blur.

## Shapes

The design system implements a controlled, compact radius profile (Level 1 - Soft) to project technical rigour and enterprise precision.

### Application Directives
- **Inputs, Buttons, Badges, Tabs:** 0.25rem (`4px` / `rounded-sm`) to 0.375rem (`6px` / base radius).
- **Cards, Panels, Modals:** 0.5rem (`8px` / `rounded-lg`).
- **Telemetry Indicators, Avatars, Badges:** Full pill curves (`9999px`) reserved strictly for circular avatars and micro status pips.

## Components

### Buttons
- **Primary:** Solid cobalt background (`#2563eb`), text `#ffffff`, height 36px (compact) or 40px (default), padding `0.5rem 1rem`, font `Inter` 14px weight 500. Hover: `#1d4ed8`. Active: `#1e40af`. Focus: 2px ring offset 2px `#2563eb`.
- **Secondary:** Surface `#ffffff`, border 1px solid `#e2e8f0`, text `#0f172a`. Hover: surface `#f8fafc`, border `#cbd5e1`.
- **Ghost / Tertiary:** No fill, text `#64748b`. Hover: surface `#f1f5f9`, text `#0f172a`.

### Input Fields & Controls
- **Text Inputs:** Height 36px, background `#ffffff`, border 1px solid `#e2e8f0`, radius 6px, text `#0f172a`, placeholder `#94a3b8`. Focus: border `#2563eb`, outline: 1px solid `#2563eb`. Error: border `#ef4444`.
- **Checkboxes & Radios:** 16px × 16px, border 1px solid `#cbd5e1`, radius 4px (checkbox) or circle (radio). Checked state: fill `#2563eb`, white checkmark glyph.

### Cards & Analytical Panels
- Pure white `#ffffff` canvas, 1px solid `#e2e8f0` border, 8px radius. Card header features 1px solid bottom divider `#e2e8f0`, height 48px, horizontal padding 16px.

### Chips & Status Badges
- **Success Chip:** Emerald light tint `#ecfdf5`, 1px solid `#a7f3d0`, text `#065f46`, font 12px weight 500, radius 4px. Incorporates 6px solid emerald dot indicator (`#10b981`).
- **Informational / Neutral Chip:** Slate-100 `#f1f5f9`, border `#e2e8f0`, text `#334155`.

### Data Tables
- Header row uses `#f8fafc`, border-bottom 1px solid `#e2e8f0`, typography `label-sm` in `#64748b`.
- Data rows height 44px, border-bottom 1px solid `#f1f5f9`, typography `body-md` in `#0f172a`. Hover state switches row background to `#f8fafc`.