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

<!-- Trigger Vercel rebuild -->
