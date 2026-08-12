# Design System Document: The Editorial Terminal

## 1. Overview & Creative North Star

**Creative North Star: The Sovereign Intelligence**
This design system rejects the frantic, "noisy" aesthetics of typical SaaS dashboards in favor of a high-signal, "Private Banking Strategy Terminal." It is designed for users who value implication over raw data, and decision-making over scrolling.

The system breaks the "template" look through **Intentional Asymmetry** and **Tonal Depth**. By utilizing high-contrast typography scales—pairing an authoritative, oversized serif with a disciplined, technical sans-serif—we create an experience that feels curated and editorial. This is not a tool for data entry; it is a platform for strategic clarity.

---

## 2. Colors & Surface Philosophy

The palette is anchored in heritage and permanence. It avoids the clinical coldness of pure white (#FFFFFF) in favor of warm, organic tones that mimic heavy-stock parchment.

### The "No-Line" Rule
To achieve a premium feel, **1px solid borders are prohibited for sectioning.** Structural boundaries must be defined solely through:
- **Background Color Shifts:** Placing a `surface-container-low` section against a `surface` background.
- **Negative Space:** Using generous whitespace (24px, 48px, 64px) to denote grouping.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers, like stacked sheets of fine stationery.
- **Base Layer:** `surface` (#fbf9f4) – The primary canvas.
- **Secondary Logic:** `surface-container-low` (#f5f3ee) – For secondary navigation or sidebar elements.
- **Active Focus:** `surface-container-lowest` (#ffffff) – Reserved for the most critical content cards or input areas to make them "pop" against the off-white background.
- **Nested Context:** `surface-container-high` (#eae8e3) – For inset areas like code blocks or data tables within a card.

### Signature Textures & Glass
- **The "Burnished" CTA:** Use a subtle linear gradient for primary buttons, transitioning from `primary` (#8a4c27) to `primary-container` (#a7633c) at a 135-degree angle. This adds a "soul" and depth that flat hex codes lack.
- **Strategic Glass:** For floating menus or dropdowns, use `surface` at 80% opacity with a `20px backdrop-blur`. This allows the "parchment" texture to bleed through, softening the interface.

---

## 3. Typography: Editorial Authority

The typographic system relies on a sharp juxtaposition between the "Human" (Serif) and the "Machine" (Sans-Serif).

| Level | Token | Font Family | Size | Intent |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Newsreader | 3.5rem | High-impact insights & hero stats. |
| **Headline** | `headline-md` | Newsreader | 1.75rem | Section headers; editorial voice. |
| **Title** | `title-md` | Inter | 1.125rem | Specific data point labels; UI headers. |
| **Body** | `body-md` | Inter | 0.875rem | Reports, descriptions, and analysis. |
| **Label** | `label-sm` | Inter | 0.6875rem | Metadata, timestamps, technical specs. |

**Styling Note:** Use `headline` and `display` styles with tighter letter-spacing (-0.02em) to emphasize the "printed" look. Use `label` styles with increased letter-spacing (+0.05em) and Uppercase for a technical, terminal-like feel.

---

## 4. Elevation & Depth

We convey hierarchy through **Tonal Layering** rather than traditional structural lines.

- **The Layering Principle:** Depth is achieved by stacking surface tiers. Place a `surface-container-lowest` card on a `surface-container-low` section to create a soft, natural lift.
- **Ambient Shadows:** Shadows should be used sparingly (e.g., on floating modals). Use a `0px 12px 32px` blur at 6% opacity. The shadow color must be a tinted version of `on-surface` (#1b1c19) to mimic natural light.
- **The "Ghost Border" Fallback:** If a border is required for accessibility (e.g., in a high-density table), use `outline-variant` (#d8c2b8) at **20% opacity**. Never use 100% opaque borders.

---

## 5. Components

### Buttons
- **Primary:** Gradient (Primary to Primary-Container), `0.25rem` (sm) corner radius, white text.
- **Secondary:** `surface-container-high` background, `on-surface` text. No border.
- **Tertiary:** Transparent background, `primary` text, underlined on hover.

### Input Fields
- **Style:** Minimalist. No background color (transparent). Only a bottom border using `outline-variant` at 40%. On focus, the bottom border transitions to `primary` (#8a4c27) at 2px thickness.
- **Labels:** Always use `label-sm` in uppercase above the field.

### Cards & Lists
- **Rule:** **No Divider Lines.** 
- Separate list items using a `12px` vertical gap. Use a `surface-container-low` background on hover to indicate interactivity.
- **Asymmetry:** For strategic insights, use cards with an "Editorial" layout—large `display-sm` numbers paired with `body-md` analysis text, left-aligned with generous padding (32px).

### Strategic Chips
- **Status:** Use `tertiary-container` for neutral states and `primary-fixed-dim` for active/urgent states. Text should always be `on-tertiary-fixed` for high legibility.

---

## 6. Do’s and Don’ts

### Do
- **Use Wide Margins:** Treat the screen like a magazine spread. Use `64px` or `80px` side margins on desktop.
- **Lead with Content:** Put the most important "implication" in `headline-lg` (Serif).
- **Embrace Warmth:** Ensure the parchment (#fbf9f4) background is consistent. Pure white is forbidden except for the interior of "Active Focus" cards.

### Don’t
- **Don't use Bright Blues or Neons:** All colors must feel muted and "burnt."
- **Don't use Heavy Shadows:** If the element doesn't look like it's resting on paper, it's too heavy.
- **Don't Center Everything:** Use left-aligned, "asymmetric" layouts to create a sense of professional movement and sophistication.
- **Don't Use 1px Borders:** Reach for background tonal shifts first. Borders are a last resort for accessibility.