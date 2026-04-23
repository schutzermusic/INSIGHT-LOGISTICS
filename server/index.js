import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { googleRoutes } from './routes/google-routes.js';
import { googleGeocoding } from './routes/google-geocoding.js';
import { queroPassagem } from './routes/quero-passagem.js';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    services: {
      routes: !!process.env.GOOGLE_SERVER_API_KEY,
      geocoding: !!process.env.GOOGLE_SERVER_API_KEY,
      queroPassagem: !!(process.env.QUERO_PASSAGEM_USER && process.env.QUERO_PASSAGEM_PASS),
    },
  });
});

// Google API routes (server-side key)
app.use('/api/routes', googleRoutes);
app.use('/api/geocoding', googleGeocoding);

// Quero Passagem API (bus tickets — server-side credentials)
app.use('/api/bus', queroPassagem);

app.listen(PORT, () => {
  const keyPreview = process.env.GOOGLE_SERVER_API_KEY
    ? `...${process.env.GOOGLE_SERVER_API_KEY.slice(-6)}`
    : 'NOT SET';
  const qpStatus = process.env.QUERO_PASSAGEM_USER ? 'CONFIGURED' : 'NOT SET';
  console.log(`[Insight Logistics] Backend running on http://localhost:${PORT}`);
  console.log(`[Insight Logistics] Google Server Key: ${keyPreview}`);
  console.log(`[Insight Logistics] Quero Passagem API: ${qpStatus} (${process.env.QUERO_PASSAGEM_ENV || 'sandbox'})`);
});
