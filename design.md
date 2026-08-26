# design.md - Lenny's Growth Assistant

## Principles

- **Impeccable over generic.** The UI should look premium and considered - no visual "AI slop". Strong hierarchy, curated color palette, purposeful animation.
- **Groundedness must be visible.** Citations (episode + clickable timestamp) are a first-class UI element, not a footnote. The assistant must visibly attribute every claim.
- **State honesty.** Loading, empty, error, and "no answer in corpus" states must each look visually distinct and be handled - no silent failures.
- **Identity-first onboarding.** The app learns the user's name before the first message so the experience feels personal from the start.

## Information Architecture

- **Landing page:** Full-screen hero (gradient cobalt + animated ambient orbs) with CTA → name modal → enters chat app.
- **Left sidebar:** App title + user identity footer; session list with `+` new chat button; pinned section at top; right-click / `⋯` context menu per session.
- **Center:** Chat thread - citations rendered inline as clickable episode+timestamp badges; provider/model dropdowns in header; LG avatar on AI messages, user initial on user messages; Served-by badge on each AI reply.
- **Right pane (on demand):** Artifact Viewer - split view when active, toggle between Preview and Code views, copy, and download buttons.

## Key Interaction States

| State | Behavior |
|---|---|
| First visit | Landing page → "Let's Start" CTA → Name modal → Chat app |
| Returning visit | Always shows the landing page on page reload. Clicking "Let's Start" checks localStorage; if the name exists, it transitions directly to the chat app (skipping the name input modal) |
| Loading response | Three-dot bounce animation; provider/model visible in header |
| Retrieval empty | Assistant message explicitly states no transcript coverage - no hallucination |
| Provider unavailable | Toast notification (top-right, error variant) with exact error from LLM API |
| Rate limit hit | Amber warn toast shows fallback model name; model dropdown updates to actual provider |
| Artifact generated | Right pane opens automatically |
| Ship 30/30 essay | Rendered in Artifact Viewer; downloadable as `.md` file |
| Citations display & click | Renders as structured interactive pills under each assistant bubble showing the guest name and timestamp (e.g. "t=43:57"). Also appends a Markdown list at the bottom. Clicking a pill opens the exact YouTube timestamp in a new tab. |
| Model switching | Provider dropdown triggers live model list fetch with loading spinner |
| Rename chat | Inline edit in sidebar; Enter to confirm, Escape to cancel |
| Delete chat | Context menu → API call → removed from sidebar |
| Pin chat | Context menu → floats to "Pinned" section at top of sidebar |
| Clear all chats | Trashcan icon in sidebar header → confirmation dialog → `DELETE /sessions` API call → clears all state |

## Implemented UI Components

| Component | Implementation |
|---|---|
| `LandingPage` | Full-screen hero with animated CSS orbs, floating quote cards, stat counters |
| `NameModal` | Frosted-glass card (glassmorphism), scale+fade-in animation, localStorage persistence |
| `LGAvatar` | 32px gradient indigo-to-blue circle with "LG" text mark - replaces old "AI" text bubble |
| `UserAvatar` | Gradient purple-pink circle with user's first initial - replaces old "U" text bubble |
| Session sidebar | Left pane with Clear All (trashcan) and New Chat (`+`) buttons; human-readable titles |
| Session context menu | Right-click / `⋯` → Rename / Pin / Delete actions |
| Inline rename | Input replaces session name text; confirmed with Enter/blur |
| Sidebar user footer | User initial avatar + name + pulsing green status dot |
| Provider selector | Pill-shaped `<select>` - "Google Gemini", "Groq Cloud", "Local (Ollama)" |
| Model selector | Dynamic `<select>` fetched from `/provider/models`; spinner while loading |
| Message thread | User messages right-aligned (indigo gradient), AI left-aligned (dark panel) |
| Typing indicator | Three bouncing dots while LLM call is in-flight |
| `ServedByBadge` | Below AI message: green dot + "Served by X" / amber "⚡ Switched to X" |
| Toast system | Four-variant (error/warn/success/info) top-right slide-in toasts, 8s auto-dismiss |
| Suggestion chips | Empty-state prompt suggestion buttons to start a conversation |
| Artifact Viewer | Right pane, `<iframe sandbox="allow-same-origin">` for HTML, `<ReactMarkdown>` for MD |
| Artifact controls | Preview/Code toggle, Copy, Download, Close |

## Design System

| Token | Value | Usage |
|---|---|---|
| `--bg-void` | `#040814` | Page background |
| `--bg-surface` | `#0C1120` | Sidebar, header |
| `--bg-panel` | `#101828` | Chat pane |
| `--bg-card` | `#151f30` | Message bubbles, inputs |
| `--brand` | `#6366f1` | Accent, active states, CTAs |
| `--text-primary` | `#f1f5f9` | Body text |
| `--text-secondary` | `#94a3b8` | Sidebar session names, labels |
| `--text-muted` | `#475569` | Timestamps, badges |
| `--success` | `#34d399` | Status dot, served-by badge |
| `--warn` | `#fbbf24` | Fallback toast, "Switched to" badge |
| `--danger` | `#f87171` | Error toast, delete ctx item |

**Typography:** `Inter` for body/labels, `Outfit` for headings and branding (both from Google Fonts)

**Icons:** `lucide-react` library throughout

**Animations:**
- Ambient orb: CSS `@keyframes orb-drift` - translate + scale 8s ease alternate
- Modal: `@keyframes modal-slide-in` - scale(0.9) + translateY(16px) → identity, 0.3s spring cubic
- Toast: `@keyframes toast-in` - translateX(40px) → 0, 0.3s spring cubic
- Floating cards: `@keyframes card-float` - vertical oscillation 5–7s
- Typing dots: `@keyframes bounce` - translateY, staggered 150ms delays
- Status dot: `@keyframes pulse-dot` - box-shadow pulse 2s

## Accessibility

- All interactive elements have `aria-label` attributes.
- Minimum touch target size: 44×44px (applied to all icon buttons - `IconBtn` wrapper enforces 34×34px + padding).
- `id` attributes on all form inputs (`message-input`, `provider-select`, `model-select`, `new-chat-btn`, `send-btn`, `cta-start`, `name-input`, `name-submit`) for browser testing and label association.
- Keyboard navigation: session list items have `role="button"` + `tabIndex={0}` + `onKeyDown` Enter handler.
- Semantic HTML: `<aside>`, `<main>` (`id="main-content"`), `<header>`, `<form>`, `<dialog>` (modal `role="dialog" aria-modal="true"`).

## UI Design Decisions & Trade-offs

- **Rate-Limit Visibility vs. UX Friction:** When a rate limit is encountered, we automatically fallback and resume generation instead of blocking with a modal. An amber toast shows the fallback event and the model selector updates to the actual provider serving the request.
- **Sandboxed Artifact Rendering:** HTML artifacts are rendered inside `<iframe sandbox="allow-same-origin">` (no `allow-scripts`) to prevent XSS risks from model-generated code.
- **Persistent Multi-Pane Layout:** Three-column sidebar-chat-artifact design lets users read generated summaries while refining queries without scrolling to find them.
- **Frontend-only chat titles:** Chat titles are derived from the first user message and stored in component state (not persisted to DB) to avoid the cost of a separate LLM title-generation call. Explicit rename via `PATCH /sessions/{id}` persists to the `metadata_` JSONB column.
- **Name modal persistence via localStorage:** The user's name is stored in `localStorage` (not a session cookie or DB row) to keep the project single-tenant and deployment-simple. On refresh, the app reads the stored name and skips the onboarding flow.
