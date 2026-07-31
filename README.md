# Gig Guardian

Build a web app called "GigShield" for gig workers (delivery riders, cab drivers) to track earnings and check if they're being paid fairly.

Pages/features needed:

1. Job Logging Page — a form to add a job with fields: platform name (dropdown: Zomato/Swiggy/Uber/Ola/Other), fare amount (₹), distance (km), time taken (minutes), date/time. Save each job to a list.

2. Dashboard Page — show:

   - Total earnings this week

   - Total hours worked this week

   - List of all logged jobs in a table

   - A "Fairness Check" flag next to each job: compare fare ÷ distance against a benchmark of ₹15/km — if the job's rate is below 80% of benchmark, mark it "⚠️ Possible Underpayment" in red, otherwise "✅ Fair" in green

3. Simple clean dark UI, mobile-friendly since gig workers use phones.

Use React with a simple in-memory state for now (no backend yet, I'll add Supabase next).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/01ee211d-f730-4e1b-9fd0-8458ef514f9b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
