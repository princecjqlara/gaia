import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

// Load .env file manually for server-side use
const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Custom plugin to handle Vercel-style API routes locally
function apiRoutesPlugin() {
  return {
    name: 'api-routes',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          try {
            // Parse the URL to get the API path
            const url = new URL(req.url, `http://${req.headers.host}`);
            const apiPath = url.pathname.replace('/api/', '');

            // Build the file path (e.g., /api/booking/settings -> api/booking/settings.js)
            const filePath = join(__dirname, 'api', `${apiPath}.js`);

            if (!existsSync(filePath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'API route not found' }));
              return;
            }

            // Clear the module cache to allow hot reloading
            const moduleUrl = `file://${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;

            // Dynamically import the handler
            const module = await import(moduleUrl);
            const handler = module.default;

            if (typeof handler !== 'function') {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Invalid API handler' }));
              return;
            }

            // Parse query parameters
            const query = Object.fromEntries(url.searchParams);

            // Parse body for POST/PUT requests
            let body = {};
            if (req.method === 'POST' || req.method === 'PUT') {
              const chunks = [];
              for await (const chunk of req) {
                chunks.push(chunk);
              }
              const rawBody = Buffer.concat(chunks).toString();
              if (rawBody) {
                try {
                  body = JSON.parse(rawBody);
                } catch {
                  body = rawBody;
                }
              }
            }

            // Create request-like object
            const fakeReq = {
              method: req.method,
              url: req.url,
              headers: req.headers,
              query,
              body
            };

            // Create response-like object
            const fakeRes = {
              statusCode: 200,
              headers: {},
              setHeader(key, value) {
                this.headers[key] = value;
                res.setHeader(key, value);
              },
              status(code) {
                this.statusCode = code;
                res.statusCode = code;
                return this;
              },
              json(data) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              },
              end(data) {
                res.end(data);
              }
            };

            // Call the handler
            await handler(fakeReq, fakeRes);
          } catch (error) {
            console.error('API Route Error:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apiRoutesPlugin()],
  server: {
    port: 3000,
    open: true,
    // Handle SPA routing - fallback to index.html for all routes
    historyApiFallback: true
  },
  // For production builds, ensure proper base path
  base: '/',
  // Define environment variables that should be exposed to the client
  define: {
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL),
    'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY),
    'process.env.SUPABASE_SERVICE_ROLE_KEY': JSON.stringify(process.env.SUPABASE_SERVICE_ROLE_KEY)
  }
});
