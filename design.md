# HobbyMaxx design system

Status: approved palette, with a user-requested minimal, mobile-first chat composition.
Source: the user-supplied **Hacktoberfest 2026 (alpha)** design system. This is a HobbyMaxx adaptation, not a claim of Hacktoberfest affiliation.

## Product and visual intent

HobbyMaxx uses an open-weight Gemma model to turn a personal conversation into three hobby experiments. Users log attempts, earn points, and refresh recommendations on a 7- or 14-day cycle.

**Chat first.** HobbyMaxx is a chatbot with recommendation and record-keeping utilities. The welcome screen contains a heading, one short subtitle, and one CTA. It opens directly into a full-height chat where Gemma generates the first question. Preserve cream, forest teal, coral actions, and restrained gold rewards; remove large decorative heroes, sidebars, progress steppers, marketing panels, and explanatory cards. Privacy, connection details, storage explanations, and data controls belong behind the header info icon.

The voice is direct, encouraging, inclusive, and never gatekeeping. Reward exploration, not performance, oversharing, or daily streaks. Use HobbyMaxx as the product identity; any Hacktoberfest acknowledgment is secondary. Do not use the Hacktoberfest favicon as the HobbyMaxx app icon.

## Color tokens

Preserve these source tokens. Component-level accessibility adjustments are listed separately below.

| Token                                                     | Value     |
| --------------------------------------------------------- | --------- |
| surface / background / surface-container                  | `#f2f2eb` |
| surface-dim / surface-container-highest / surface-variant | `#e9ecef` |
| surface-bright                                            | `#ffffff` |
| surface-container-lowest                                  | `#f7f7f2` |
| surface-container-low                                     | `#f5f5f0` |
| surface-container-high                                    | `#efefea` |
| on-surface / on-background                                | `#101d1d` |
| on-surface-variant                                        | `#505050` |
| inverse-surface                                           | `#1a1a1a` |
| inverse-on-surface                                        | `#f2f2eb` |
| outline                                                   | `#aaaaaa` |
| outline-variant                                           | `#d0d0d0` |
| surface-tint / secondary / secondary-fixed                | `#3d5f58` |
| primary / inverse-primary / primary-fixed                 | `#e97b77` |
| on-primary / on-primary-fixed                             | `#101d1d` |
| primary-container / primary-fixed-dim                     | `#e53927` |
| on-primary-container                                      | `#ffffff` |
| on-primary-fixed-variant                                  | `#671912` |
| on-secondary / on-secondary-fixed                         | `#ffffff` |
| secondary-container / secondary-fixed-dim                 | `#2d4540` |
| on-secondary-container / on-secondary-fixed-variant       | `#f2f2eb` |
| tertiary / tertiary-fixed                                 | `#f5b726` |
| on-tertiary / on-tertiary-fixed                           | `#101d1d` |
| tertiary-container                                        | `#ffd8a8` |
| on-tertiary-container                                     | `#3d2f0a` |
| tertiary-fixed-dim                                        | `#d99f1a` |
| on-tertiary-fixed-variant                                 | `#6c5a1a` |
| error                                                     | `#b3261e` |
| on-error                                                  | `#ffffff` |
| error-container                                           | `#f9dedc` |
| on-error-container                                        | `#410e0b` |

Cream is the main background; white is for inputs and selected surfaces. Teal anchors structural panels. Coral identifies actions and interaction. Gold marks points and milestones. Do not use coral for ordinary body text. Decorative coral is permitted in the explicitly approved geometric brand artwork, resolving the source's conflicting decorative-accent guidance.

## Typography

| Role        | Family                | Size / line height   | Weight | Tracking |
| ----------- | --------------------- | -------------------- | ------ | -------- |
| display     | Barlow Semi Condensed | 99px / 108px desktop | 800    | -0.02em  |
| headline-lg | Barlow Semi Condensed | 48px / 56px          | 700    | -0.015em |
| headline-md | Barlow Semi Condensed | 32px / 40px          | 700    | -0.01em  |
| title-lg    | Inter                 | 22px / 28px          | 700    | 0        |
| body-lg     | Inter                 | 18px / 28px          | 400    | 0.005em  |
| body-md     | Inter                 | 16px / 24px          | 400    | 0.01em   |
| label-md    | Martian Mono          | 13px / 20px          | 650    | 0.02em   |
| label-sm    | Martian Mono          | 12px / 16px          | 500    | 0.03em   |

Self-host the required font files and weights, with readable system fallbacks. Use a variable font that supports 650 for Martian Mono, or document the nearest available weight. Headlines scale down fluidly on phones; never force a 99px headline onto a narrow screen. Barlow is for headings, Inter for reading and forms, Martian Mono for short labels and metadata. Do not place small text over busy artwork or depend on text shadows for contrast.

## Layout, shapes, and depth

- Maximum container: 1280px; desktop grid: 12 columns.
- Desktop gutters: 24px; mobile gutters: 12px minimum.
- Spacing: unit 8px; xs 4px; sm 12px; md 24px; lg 40px; xl 64px.
- Source radii: sm 4px, default 8px, md 12px, lg 16px, xl 24px, full 9999px. Buttons, inputs, and cards use 8px; badges use full. Do not use larger card/button radii.
- Card padding: 30px desktop; reduce on mobile when needed to preserve reading width.
- Elevation sm: `0 1px 2px rgba(0,0,0,0.06)`.
- Elevation md: `0 3px 8px rgba(0,0,0,0.15)`.
- Elevation lg: `0 8px 24px rgba(0,0,0,0.12)`.
- Flat-maximalist, not glassmorphic: no backdrop blur or oversized shadows.
- Geometric bars and staggered squares are hard-edged decorative SVG shapes, hidden from assistive technology.

## Components

### Buttons

Primary: coral background, near-black text, Inter, 8px radius, minimum 44px height. Use flat controls without decorative shadows. Secondary utility actions use simple text or a thin outline. Icon controls are at least 44px and always have accessible names. Support wrapping/localized labels rather than clipping at a fixed height.

Hover and active states must use verified accessible colors. The source's white-on-red hover and near-black-on-red active states fail 4.5:1 for small labels and must not be copied unchanged. Select a darker derived red for white labels when implementing, and verify every state.

### Cards, fields, badges, and lists

- Cards: surface-container-lowest, 8px radius, 1px outline-variant border, elevation md. Only genuinely interactive cards receive hover feedback.
- Inputs: white, Inter body-md, 8px radius, 12px 16px padding, subtle inset shadow. Always visible labels; errors use text and an icon as well as color.
- Badges: tertiary-container / on-tertiary-container, label-sm, full radius, 4px 12px padding. A red badge needs an accessible text pairing.
- List items: 12px 16px padding, up to 12px radius. Hover backgrounds may use surface-container-high; keep text dark rather than coral on cream.
- Focus: a strong contrasting outline. The source's faint coral glow is supplementary, never the only focus indicator.
- Motion: approximately 150ms for controls and 200ms for card feedback; transition explicit properties, not `all`. Honor reduced motion.

## Accessibility

Target WCAG 2.2 AA, with the source's stronger body-text contrast goal where practical. Checked combinations: near-black on cream 15.36:1; white on teal 7.06:1; white on source red 4.25:1; near-black on source red 4.07:1; coral on cream 2.47:1.

Use at least 44px touch targets, keyboard access, visible focus, semantic headings and labels, sufficient non-text contrast, and status announcements that do not read every streamed token. Verify long messages, narrow screens, mobile keyboards, and zoom. Do not communicate progress, selection, errors, or points through color alone.

## Screen direction

1. **Welcome:** “Find your next thing.”, one short subtitle, and “Let’s chat”. No artwork, secondary panels, footer slogans, or extra onboarding CTAs. The info icon is available before starting.
2. **Conversation:** messages and a bottom composer, filling the mobile viewport. Gemma asks exactly five numbered-topic turns: interests, time, budget, setting, company. The application advances the sequence and automatically starts recommendations after answer five; there is no early “Find hobbies” action or mandatory review step. Assistant text is unboxed; user replies use a restrained bubble. Waiting/preparation uses a three-dot animated bubble, not visible thinking text. Honor reduced motion and provide a screen-reader status. Stop, retry, skips, and errors remain contextual.
3. **Preference review:** a short editable utility form, not a marketing page. Keep visible labels, required choices, 7/14-day selection, and optional conversation deletion; show validation guidance only when needed.
4. **Recommendations:** three model recommendation messages in the same chat thread, with rationale, starter activity, and adaptation. Each has a compact “Rate activity” action. No separate recommendation dashboard is required.
5. **Reflection:** a guided chat for completion, date, enjoyment, difficulty, and an optional note. Use quick replies and the existing composer; no rating forms, select fields, or separate date inputs. Save automatically after the note or skip, and confirm points in a chat message.
6. **Information and privacy:** the info dialog retains privacy, storage, and data-management controls. Activity history and favorite selection for refresh are chat interactions. The thread starts at the bottom above the composer; newer messages push older messages upward, while manual scrolling still allows reading earlier messages. Keep chronological DOM order for assistive technology.

## Truthful UI copy and states

Gemma is hosted on Render for the demo. Conversations and history are saved on the current device; relevant messages are transmitted for inference. No accounts or cross-device sync in the initial release. Do not claim end-to-end encryption, on-device inference, or that messages never leave the device.

Offline users can view saved recommendations and log activities. AI replies and refreshes require internet. Failed refreshes preserve the current cycle. Explain missing local data, storage errors, queue saturation, cancellation, and retry without exposing internal errors or personal information.

## Implementation order

Start with the mobile single-column composition; widen its reading measure on desktop rather than introducing a dashboard. Use Inter for controls and reading, Barlow for headings; the mono family is not loaded when unused. The chat log scrolls independently, the composer remains at the bottom, and viewport height responds to the mobile keyboard. Verify the interface at narrow widths and desktop, including focus trapping/restoration in the info dialog, with user-run bounded review passes.
