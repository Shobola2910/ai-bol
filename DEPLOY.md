# BOL Date Corrector — Deploy Instructions

## 1. Local development

```bash
# Create .env.local file
cp .env.example .env.local
# Add your OpenAI API key inside .env.local:
# OPENAI_API_KEY=sk-...

npm run dev
# Open http://localhost:3000
```

## 2. Deploy to Vercel

### Option A — Vercel CLI (recommended)
```bash
npm install -g vercel
vercel login
vercel --prod
```
When prompted: set `OPENAI_API_KEY` environment variable.

### Option B — GitHub + Vercel Dashboard
1. Push this project to a GitHub repo
2. Go to https://vercel.com/new
3. Import the repo
4. In "Environment Variables" add:
   - Name: `OPENAI_API_KEY`
   - Value: `sk-your-key-here`
5. Click Deploy

## 3. How the app works

1. Upload BOL (JPG, PNG, or PDF)
2. AI (GPT-4o Vision) analyzes the document and finds all dates
3. Dates are highlighted on the document with colored boxes
4. Chat panel shows: "I found X dates: #1 01/15/2024 (Pickup Date)..."
5. Click a date on the document OR type its number in chat
6. AI asks: "What should the correct date be?"
7. Type the new date → correction is applied (white-out + new text)
8. Repeat for any other dates
9. Click "Download Corrected BOL" to save the file
