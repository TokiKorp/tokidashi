import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    {
      name: 'run-cli-middleware',
      configureServer(server) {
        server.middlewares.use('/api/run-cli', (req, res, next) => {
          if (req.url !== '/' && req.url !== '') {
            next();
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }
          
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { cliName, prompt } = JSON.parse(body);
              
              let binary = cliName;
              const home = process.env.HOME || '';
              if (cliName === 'agy') {
                binary = `${home}/.local/bin/agy`;
              } else if (cliName === 'codex') {
                binary = `${home}/.nvm/versions/node/v24.15.0/bin/codex`;
              } else if (cliName === 'claude') {
                binary = `${home}/.nvm/versions/node/v24.15.0/bin/claude`;
              }
              
              let cmdStr = '';
              if (cliName === 'agy') {
                cmdStr = `"${binary}" --print ${JSON.stringify(prompt)}`;
              } else if (cliName === 'codex') {
                cmdStr = `"${binary}" exec ${JSON.stringify(prompt)}`;
              } else if (cliName === 'claude') {
                cmdStr = `"${binary}" -p ${JSON.stringify(prompt)}`;
              } else {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Unknown CLI' }));
                return;
              }
              
              const env = { ...process.env, PAGER: 'cat' };
              const { stdout } = await execPromise(cmdStr, { env });
              
              let response = stdout;
              let tokensConsumed = 0;
              
              if (cliName === 'codex') {
                const tokenMatch = stdout.match(/tokens used\s*([\d,]+)/);
                if (tokenMatch) {
                  tokensConsumed = parseInt(tokenMatch[1].replace(/,/g, ''), 10);
                }
                
                const codexMatch = stdout.match(/codex\r?\n([\s\S]*?)(?:tokens used|$)/);
                if (codexMatch) {
                  response = codexMatch[1].trim();
                }
              }
              
              if (!tokensConsumed) {
                const baseTokens = cliName === 'agy' ? 12000 : cliName === 'codex' ? 8000 : 25000;
                tokensConsumed = baseTokens + Math.floor(prompt.length / 4) + Math.floor(response.length / 4);
              }
              
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                response: response.trim(),
                cli_used: cliName,
                tokens_consumed: tokensConsumed,
                success: true
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({
                success: false,
                error: err.message,
                tokens_consumed: 0,
                response: ''
              }));
            }
          });
        });
      }
    }
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
