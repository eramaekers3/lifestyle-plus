import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Lets `npm run dev` answer /api/calendar the same way Vercel does in production.
function devApi() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/calendar', async (req, res) => {
        const send = (status, data) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };
        if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let body = {};
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          /* empty */
        }
        const { handle } = await server.ssrLoadModule('/api/_calendar-core.js');
        await handle(body, send);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  // Accept both Vite-style and Next.js-style names for the Supabase keys.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
});
