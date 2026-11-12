import react from "@vitejs/plugin-react";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exhibitionsDir = path.join(repoRoot, "exhibitions");

/**
 * In development, re-run scripts/prepare-exhibitions.mjs whenever a file in
 * exhibitions/ is added, changed or removed, then reload the browser.
 */
function watchExhibitions() {
  return {
    name: "watch-exhibitions",
    apply: "serve",
    configureServer(server) {
      let timer = null;
      let running = false;
      let again = false;

      const prepare = () => {
        if (running) {
          again = true;
          return;
        }
        running = true;
        server.config.logger.info("exhibitions/ changed, preparing exhibitions …", { timestamp: true });
        execFile(process.execPath, [path.join(repoRoot, "scripts", "prepare-exhibitions.mjs")], { cwd: repoRoot }, (error, stdout, stderr) => {
          running = false;
          const output = `${stdout}${stderr}`.trim();
          if (output) server.config.logger[error ? "error" : "info"](output);
          server.ws.send({ type: "full-reload" });
          if (again) {
            again = false;
            prepare();
          }
        });
      };

      server.watcher.add(exhibitionsDir);
      server.watcher.on("all", (event, file) => {
        if (!["add", "change", "unlink"].includes(event)) return;
        if (path.dirname(file) !== exhibitionsDir || !file.endsWith(".json")) return;
        clearTimeout(timer);
        timer = setTimeout(prepare, 300);
      });
    },
  };
}

// VITE_BASE lets the same build be served from a sub-path,
// e.g. VITE_BASE=/exhibition/ for https://www.manuscripta.se/exhibition/.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), watchExhibitions()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
