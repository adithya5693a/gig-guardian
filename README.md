# GigShield

GigShield is a mobile-friendly fairness and earnings assistant for gig workers such as delivery riders, cab drivers, and auto drivers. It helps workers record jobs, understand their earnings, identify potentially underpaid trips, and review fare patterns using transparent benchmarks.

The application is designed for local development first. It currently stores job records in the browser and uses client-side OCR for screenshot extraction. A backend such as Supabase can be added later for accounts, synchronized data, and real community submissions.

## Highlights

- Dashboard for weekly and all-time earnings
- Total hours worked and earnings-per-hour summaries
- Manual job logging for delivery and ride-hailing work
- Screenshot upload with browser-based OCR
- Automatic extraction of payout, distance, duration, platform, vehicle, and area when readable
- Fairness checks based on vehicle benchmarks and a simulated community benchmark
- Community benchmark sample counts for transparency
- Safety check and savings-goal tools
- AI chat for fare, earnings, complaints, safety, and savings questions
- OpenRouter + Gemini integration with LM Studio/Qwen fallback
- Local rule-based fallback when both AI services are unavailable
- English, Hindi, Kannada, Tamil, Telugu, Marathi, and Bengali interface options
- Responsive dark interface optimized for mobile use

## Technology

- React 19
- TypeScript
- TanStack Start and TanStack Router
- Vite
- Tailwind CSS
- Tesseract.js for local OCR
- Recharts for earnings visualization
- Gemini Generate Content API
- LM Studio OpenAI-compatible local API

## Requirements

- Node.js 20 or newer
- npm
- Optional: Google Gemini API key
- Optional: LM Studio with a compatible local model

Check your installed versions:

```bash
node --version
npm --version
```

## Local installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/adithya5693a/gig-guardian.git
cd gig-guardian
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local address printed by Vite. It is normally:

```text
http://localhost:5173
```

## AI configuration

The project supports OpenRouter first, then Gemini, then LM Studio, then a deterministic local assistant. You can add your OpenRouter API key directly in the AI chat screen, or configure it in the environment.

### OpenRouter (recommended)

Create an OpenRouter API key at [OpenRouter settings](https://openrouter.ai/settings/keys), or paste it in the AI chat screen. Keep the key local and never commit it to GitHub.

For local development, use an ignored environment file such as `.env.local`:

```env
VITE_OPENROUTER_API_KEY=your_real_openrouter_key
VITE_OPENROUTER_MODEL=openai/gpt-4o-mini
```

### Gemini

Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey). Keep the key local and never commit it to GitHub.

For local development, use an ignored environment file such as `.env.local`:

```env
VITE_GEMINI_API_KEY=your_real_gemini_key
VITE_GEMINI_MODEL=gemini-2.0-flash
```

Restart the development server after changing environment variables:

```bash
npm run dev
```

The repository also contains `.env.example` as a configuration reference. It must contain placeholders only.

### LM Studio fallback

Install [LM Studio](https://lmstudio.ai/), download and load:

```text
Qwen2.5-Coder-7B-Instruct-4bit
```

Start LM Studio's local server on port `1234`. The default configuration is:

```env
VITE_LM_STUDIO_URL=http://127.0.0.1:1234/v1/chat/completions
VITE_LM_STUDIO_MODEL=Qwen2.5-Coder-7B-Instruct-4bit
```

The request sequence is:

```text
OpenRouter → Gemini → LM Studio/Qwen → local rule-based assistant
```

If LM Studio is not running, the application continues using the local assistant.

## How screenshot OCR works

On the Log Job page, choose **Scan screenshot** and upload a PNG or JPEG screenshot. Tesseract.js reads the image locally in the browser. The parser then attempts to identify:

- Payout, including ₹, Rs, INR, and रु formats
- Trip and pickup distances
- Time in minutes
- Platform name
- Vehicle type
- Pickup and destination areas
- Date and time

Detected values are written into the form for review before saving. OCR quality depends on screenshot resolution, contrast, and readable text. Always verify the extracted values before submitting a job.

## Fairness and community benchmark

GigShield combines a fixed vehicle baseline with simulated community observations. Community rates are grouped by platform and vehicle type, then summarized using a median rate to reduce the effect of unusual values. When enough observations are available, the result is blended with the vehicle baseline.

The current community observations are deterministic demo data. They are not real user submissions and should be replaced with a backend dataset before production use. The UI shows the number of observations used so the benchmark remains explainable.

The fairness result includes:

- Expected payout
- Effective rate per kilometer
- Fairness threshold
- Whether the job may be underpaid
- Community or vehicle benchmark source
- Community sample size

## Multilingual interface

Use the language selector in the top navigation to switch between:

- English
- हिन्दी (Hindi)
- ಕನ್ನಡ (Kannada)
- தமிழ் (Tamil)
- తెలుగు (Telugu)
- मराठी (Marathi)
- বাংলা (Bengali)

The selected language is stored in the browser. AI prompts also include the selected language so generated responses can follow the interface language.

## Available scripts

```bash
npm run dev       # Start the development server
npm run build     # Create a production build
npm run preview   # Preview the production build
npm run lint      # Run ESLint
npm run format    # Format the project with Prettier
```

## Project structure

```text
src/
├── components/       Shared UI, dashboard cards, charts, and fairness visuals
├── hooks/            Reusable React hooks
├── lib/
│   ├── ai.ts         Gemini, LM Studio, and local fallback logic
│   ├── i18n.tsx      Language state and translations
│   ├── jobs-store.tsx Job state, benchmarks, and persistence
│   └── ocr.ts        OCR extraction and ride-data parsing
├── routes/
│   ├── index.tsx     Dashboard and setup flow
│   ├── log.tsx       Manual and screenshot-based job logging
│   └── assistant.tsx AI chat
└── styles.css        Global styles and design tokens
```

## Data and privacy

Job records are currently stored in browser `localStorage`. There is no authentication or server database in the current version.

The OCR pipeline runs locally in the browser. AI requests send the chat prompt and relevant job context to the configured OpenRouter endpoint (falling back to Gemini, then LM Studio). LM Studio requests remain on the local machine.

For production:

- Move Gemini calls to a backend proxy
- Store API keys as server-side secrets
- Add authentication and authorization
- Replace simulated community data with consented, anonymized submissions
- Add rate limiting and request logging
- Do not commit `.env`, `.env.local`, or real API keys

## Troubleshooting

### The AI chat uses the local fallback

Check that Gemini is configured with a real key, or start LM Studio with the configured model. A `429` response means Gemini quota or rate limits were reached; the fallback is expected behavior.

### OCR fills incorrect values

Use a sharper screenshot with readable text and review the form before saving. OCR can confuse currency symbols, small digits, or neighboring labels.

### The page does not reflect environment changes

Stop and restart Vite after changing environment variables:

```bash
Ctrl+C
npm run dev
```

### Build issues after dependency changes

Remove and reinstall dependencies only when necessary:

```bash
rm -rf node_modules
npm install
npm run build
```

## Contributing

1. Create a feature branch.
2. Make focused changes.
3. Run `npm run build` and `npm run lint`.
4. Do not include secrets or personal screenshots in commits.
5. Open a pull request with a clear description and testing notes.

## License

No license has been specified yet. Add a license file before distributing the project publicly.
