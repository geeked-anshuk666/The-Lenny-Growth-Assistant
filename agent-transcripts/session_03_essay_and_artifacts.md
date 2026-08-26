# Session 03 - Ship 30/30 Essay Skill, Artifact Extraction, Artifact Viewer Frontend

**Date:** 2026-08-24  
**Focus:** Ship 30/30 structured essay generation skill, fenced artifact extraction from LLM output, sandboxed Artifact Viewer side pane in the React frontend

---

## Prompt 1 - Implement the Ship 30/30 essay skill

> I need a "Ship 30/30" essay generation skill. When the user asks to turn an insight into an essay, the agent should produce a ~1,250 word structured essay using the Ship 30/30 atomic essay framework. The essay must be grounded in the RAG corpus.

**Design decision:** Implemented as a **dedicated skill** with its own system prompt — not a one-shot modifier bolted onto the general chat prompt. This matches how the Pi agent framework intends skills to work and produces more reliable formatting.

**Ship 30/30 system prompt structure in `agent-service/src/index.ts`:**
```typescript
const SHIP_3030_SYSTEM_PROMPT = `
You are a world-class digital writer following the Ship 30/30 atomic essay framework.

Structure your essay exactly as follows:
1. HOOK (1-2 sentences): A counterintuitive, provocative, or curiosity-driven opening. No generic statements.
2. CONTEXT (2-3 sentences): Frame the problem or situation.
3. MAIN BODY (4-6 paragraphs): Each paragraph makes one atomic, specific point. Bold the most important idea per paragraph.
4. EXAMPLES (inline): Use specific named examples with timestamps from the provided transcript context.
5. CLOSING TAKEAWAY (1 paragraph): One actionable, memorable conclusion.

Target length: 1,100-1,350 words.
You MUST ground every claim in the provided context. Cite guest name and timestamp per claim.
Wrap the entire essay in a markdown code fence: \`\`\`markdown ... \`\`\`
`;
```

**Skill trigger detection** in `api/main.py`:
```python
ESSAY_TRIGGERS = [
    "ship 30", "essay", "turn this into", "write an essay",
    "atomic essay", "make this shareable"
]

is_essay_request = any(
    t in user_message.lower() for t in ESSAY_TRIGGERS
)

system_prompt = SHIP_3030_SYSTEM_PROMPT if is_essay_request else GENERAL_SYSTEM_PROMPT
```

---

## Prompt 2 - Test the essay skill - first attempt failed

> Ask: "Turn Brian Chesky's ideas about being in the details into a Ship 30/30 essay."

**First attempt result (failure):** Essay was ~420 words, no hook structure, and did not wrap in a `\`\`\`markdown\`\`\`` fence. The LLM (Groq, `llama-3.1-8b-instant` at the time) ignored the length and format instructions.

**Diagnosis:** The system prompt word count instruction was too passive ("Target length: 1,100-1,350 words"). Small models don't obey targets — they need hard structural requirements.

**Fix — Explicit structural scaffolding added to system prompt:**
```
REQUIRED FORMAT (you must produce all of these):
[ ] Hook sentence (1-2 sentences, bold the key claim)
[ ] 5 body paragraphs minimum, each 100-180 words
[ ] At least 3 timestamped citations from transcript context
[ ] Closing paragraph with one actionable takeaway
[ ] Full essay wrapped in ```markdown ... ```

Do not summarise. Do not produce fewer than 1,000 words. This is a long-form essay, not a bullet list.
```

**Second attempt result (success):** 1,247 words, hook present, 4 citations from Brian Chesky's episode, closing takeaway present. ✅

---

## Prompt 3 - Artifact extraction from fenced LLM output

> The essay comes back as text. I need the frontend to render it in a side pane, not inline in chat. Extract the fenced block and return it as a separate artifact field.

**Artifact extractor implemented in `agent-service/src/index.ts`:**
```typescript
function extractArtifact(text: string): { artifact: Artifact | null; cleanText: string } {
  const htmlMatch = text.match(/```html\n([\s\S]*?)```/);
  const mdMatch = text.match(/```markdown\n([\s\S]*?)```/);

  if (htmlMatch) {
    return { artifact: { type: 'html', content: htmlMatch[1] }, cleanText: text.replace(htmlMatch[0], '[Artifact generated — see side panel]') };
  }
  if (mdMatch) {
    return { artifact: { type: 'markdown', content: mdMatch[1] }, cleanText: text.replace(mdMatch[0], '[Artifact generated — see side panel]') };
  }
  return { artifact: null, cleanText: text };
}
```

**API response updated:** `POST /sessions/{id}/messages` now returns `{ content, citations, artifact, provider_used }`. Artifact is also persisted to `ArtifactModel` table with `session_id` FK.

---

## Prompt 4 - Build the Artifact Viewer frontend component

> The artifact should render in a right side pane beside chat. HTML artifacts need a sandboxed iframe. Markdown artifacts use ReactMarkdown. Add Preview/Code toggle buttons plus Copy and Download.

**`ArtifactViewer` component built in `frontend/src/App.tsx`:**

```tsx
// HTML artifacts - sandboxed iframe, no allow-scripts
<iframe
  srcDoc={artifact.content}
  sandbox="allow-same-origin"
  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
  title="Generated artifact"
/>

// Markdown artifacts - ReactMarkdown with GFM
<ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
```

**Security decision logged:** `sandbox="allow-same-origin"` without `allow-scripts` was chosen explicitly over `allow-scripts allow-same-origin` to prevent XSS from model-generated HTML executing arbitrary JavaScript. This mirrors the Claude Artifacts security model. Noted in `architecture.md §6`.

**Controls added:**
- **Preview** / **Code** toggle — switch between rendered view and raw source
- **Copy** — `navigator.clipboard.writeText(artifact.content)`
- **Download** — creates a Blob URL, triggers `<a download>` click, then revokes URL

**Artifact Viewer auto-opens** when any `artifact` field is present in an API response. Remains open until user explicitly closes it.

---

## Prompt 5 - Add markdown summary / HTML card generation

> Besides essays, can I also ask "make me an HTML card with the key takeaways" and have it render in the Artifact Viewer?

**Updated trigger detection** to handle general artifact requests:
```python
HTML_TRIGGERS = ["html card", "html snippet", "make me a card", "create a card", "html summary"]
MD_TRIGGERS = ["markdown summary", "markdown table", "make a summary", "write a summary"]

is_html_request = any(t in user_message.lower() for t in HTML_TRIGGERS)
is_md_request = any(t in user_message.lower() for t in MD_TRIGGERS)
```

**System prompt branch for HTML cards:**
```
Generate a self-contained HTML snippet with inline CSS. 
No external links. No JavaScript. Wrap in ```html ... ```.
The card should visually render the key takeaways from the provided context.
```

**Test result:** "Make me an HTML card with the key takeaways from the Shreyas Doshi episode" → produced a styled dark-mode card with 4 bullet takeaways and timestamps. Rendered cleanly in the sandboxed iframe. ✅

---

## Prompt 6 - Layout: split pane with Artifact Viewer

> When the Artifact Viewer is open I want it to appear to the right of the chat. Not as a modal, not as a drawer — I want them side by side.

**Layout change:** Chat pane width transitions from `100%` to `55%` when `activeArtifact !== null`. Artifact Viewer occupies the remaining `45%`. CSS transition animates the resize so it doesn't feel jarring.

**Failed first attempt:** Used CSS Grid `grid-template-columns: 55fr 45fr`. Caused a layout shift when viewer opened because the grid recalculated and scrolled chat to top. Fixed by switching to `display: flex` with explicit width transitions on each child instead.

---

## Session outcome

- Ship 30/30 essay skill producing ~1,250-word grounded essays with structural compliance
- Artifact extractor cleanly separates fenced blocks from chat text
- Artifact Viewer renders HTML (sandboxed iframe) and Markdown (ReactMarkdown) in a side-by-side split pane
- Download and Copy controls working
- HTML card generation as a second artifact type
