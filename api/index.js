import express from 'express';
import cors from 'cors';
import { googleRoutes } from '../server/routes/google-routes.js';
import { googleGeocoding } from '../server/routes/google-geocoding.js';
import { queroPassagem } from '../server/routes/quero-passagem.js';
import { serpApiFlights } from '../server/routes/serpapi.js';
import { mobilization } from '../server/routes/mobilization.js';

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    services: {
      routes: !!process.env.GOOGLE_SERVER_API_KEY,
      geocoding: !!process.env.GOOGLE_SERVER_API_KEY,
      queroPassagem: !!(process.env.QUERO_PASSAGEM_USER && process.env.QUERO_PASSAGEM_PASS),
      flights: !!(process.env.SERPAPI_KEY || process.env.VITE_SERPAPI_KEY),
    },
  });
});

// API endpoints
app.use('/api/routes', googleRoutes);
app.use('/api/geocoding', googleGeocoding);
app.use('/api/bus', queroPassagem);
app.use('/api/flights', serpApiFlights);
app.use('/api/mobilization', mobilization);

export default app;
