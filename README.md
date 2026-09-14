# QuoteCraft AI v1.0 — Real AI

This version removes the homemade text parser from the estimate flow.

## How it works
1. User speaks or types a normal job description.
2. The server sends the text and the service catalog to OpenAI.
3. OpenAI returns strict structured JSON with separate jobs, quantities and units.
4. Prices are taken only from the user's price library.
5. Unknown work is returned as CUSTOM with a $0 rate for manual review.

## Required Vercel environment variable
Project → Settings → Environment Variables:

- Name: `OPENAI_API_KEY`
- Value: your OpenAI API key
- Environments: Production, Preview, Development

Optional:
- `OPENAI_MODEL=gpt-4.1-mini`

After saving the variable, redeploy the project.

## Security
The API key is used only in the server route. It is never sent to the browser.

## Expected test
Input:
`Замінити кран на кухні, пофарбувати одну стіну, замінити вентилятор і покласти ламінат 35 square feet.`

Expected four separate items:
- Replace kitchen faucet — 1 each
- Paint one wall — 1 each
- Replace bathroom exhaust fan — 1 each
- Install LVP / laminate flooring — 35 sq ft

## Calculator tab

A second, independent estimating tool lives alongside the flat-rate Estimates
flow, reached from the bottom nav (🧮 Calculator) or the home screen button.

Unlike Estimates (one price per unit), the Calculator prices every line with
labor + materials + supplies separately, the same formula as the standalone
construction-estimator app:

```
labor      = quantity × laborRate × difficultyMultiplier × locationMultiplier
materials  = quantity × materialRate
supplies   = suppliesFixed (if set)  OR  suppliesPct × (labor + materials)
lineTotal  = max(labor + materials + supplies, minPrice)
low/high   = lineTotal × the task's range multipliers
```

- **Voice/text input** reuses the same mic button and `/api/transcribe`
  Whisper fallback as the Estimates tab. Describe the job in Ukrainian,
  English, or mixed; press "Розрахувати" to send it to
  `/api/parse-calculator-estimate`, a second OpenAI endpoint that maps the
  description onto the Calculator's own ~35-task price catalog
  (`lib/calcPricing.ts`) and infers a difficulty (basic/standard/difficult)
  per item.
- **Location multiplier** is a single number for the whole estimate (set in
  the Client/Project/Location row), never invented by the AI.
- Every line item's task can be corrected from a dropdown, and quantity/
  difficulty are editable — the AI proposes, the numbers on screen are
  always the ones actually charged.
- **Ціни калькулятора** (an expandable panel on the Calculator screen) lets
  you edit every task's labor/material rate. These edits save to this
  browser only (`localStorage`, not Supabase) — same behavior as the
  standalone construction-estimator app.
- PDF/Print and Copy as text work the same way as the Estimates tab.

<!-- Trigger Vercel rebuild -->
