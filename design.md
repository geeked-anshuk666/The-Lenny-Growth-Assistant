# design.md — The Lenny Growth Assistant

## Principles

- **Clarity over polish-for-its-own-sake.** Graded on functionality and
  clear states, not visual flair. A clean two/three-pane layout (Claude/
  ChatGPT-style) is sufficient — but must avoid generic "AI slop" defaults.
- **Groundedness must be visible.** Citations (episode + clickable
  timestamp) are a first-class UI element, not a footnote.
- **State honesty.** Loading, empty, error, and "no answer in corpus"
  states must each look visually distinct and be handled — no silent
  failures.

## Information architecture

- **Left pane:** session list (new chat button, past sessions with IDs)
- **Center:** chat thread — citations rendered inline as clickable
  episode+timestamp badges, provider label shown on each assistant message
- **Right pane (on demand):** Artifact Viewer — split view when active,
  with toggle between Preview and Code views, copy, and download buttons
- **Header:** active provider selector (Gemini / Groq / Local) + dynamic
  per-provider model dropdown, fetched live from `/provider/models`

## Key interaction states

| State | Behavior |
|---|---|
| Loading response | Three-dot bounce animation; provider name visible in header |
| Retrieval empty | Assistant message explicitly states no transcript coverage — no hallucination |
| Provider unavailable | Inline error banner; if fallback fires, UI shows the provider that actually served the response |
| Rate limit hit | Amber warning banner auto-appears with the fallback model name; auto-dismissed after 6 seconds |
| Artifact generated | Right pane opens automatically; chat shows the full essay in chat + Artifact Viewer for preview/download |
| Ship 30/30 essay | Rendered in Artifact Viewer (long-form); downloadable as `.md` file |
| Citation click | Opens `youtube_url` at the exact timestamp in a new tab |
| Model switching | Provider dropdown triggers live model list fetch with loading spinner |

## Implemented UI components

| Component | Implementation |
|---|---|
| Session sidebar | Left pane with `+` new chat button, session list with chevron indicator |
| Provider selector | `<select>` dropdown — `Google Gemini`, `Groq Cloud`, `Local (Ollama)` |
| Model selector | Dynamic `<select>` fetched from `/provider/models`, spins while loading |
| Message thread | User messages right-aligned (primary color), AI left-aligned (dark panel) |
| Typing indicator | Three bouncing dots while LLM call is in-flight |
| Rate-limit banner | Amber `AlertTriangle` banner, auto-dismiss 6s, manual close button |
| Artifact Viewer | Right pane, `<iframe sandbox="allow-same-origin">` for HTML, `<ReactMarkdown>` for MD |
| Artifact controls | Preview/Code toggle, Copy (`lucide-react`), Download, Close |
| Error banner | Red `AlertCircle` banner for network/server errors |
| Provider badge | Per-message `<span>` showing which provider served that response |

## Responsive behavior

- Desktop: two/three-pane layout as above.
- Narrow viewport: Artifact Viewer becomes a full-screen overlay toggle
  instead of a persistent side pane.

## Accessibility

- All interactive elements have `aria-label` attributes.
- Minimum touch target size: 44×44px (applied to all icon buttons).
- `id` attributes on all form inputs (`message-input`, `provider-select`,
  `model-select`) for label association and browser testing.
- Keyboard-navigable session list, chat input, and artifact controls.
- Sufficient color contrast (dark backgrounds, white/light-gray text).
- Semantic HTML: `<aside>`, `<main>`, `<header>`, `<form>`.

## Design system

- **Color palette:** dark theme with `#080B11` base, `#0F1420` sidebar,
  primary accent from CSS variable `--color-primary`.
- **Typography:** system font stack via Tailwind defaults.
- **Icons:** `lucide-react` icon library throughout.
- **Animations:** CSS bounce for typing indicator, Tailwind transitions
  for hover states, `animate-pulse` for the live-status indicator.
