import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * npm cannot hoist some of the Manifest Editor's dependencies (upstream uses
 * pnpm), which leaves several identical copies nested in node_modules.
 * Libraries that hold React context must exist once in the bundle, so resolve
 * every import of them as if it came from one package (keeps `exports` maps working).
 */
function singleCopy(packages, fromPackage) {
  const importer = path.join(appDir, "node_modules", fromPackage, "package.json");
  const matches = (source) => packages.some((p) => source === p || source.startsWith(`${p}/`));
  return {
    name: "single-copy",
    enforce: "pre",
    async resolveId(source, from, options) {
      if (!matches(source) || from === importer) return null;
      return this.resolve(source, importer, { ...options, skipSelf: true });
    },
  };
}

// VITE_BASE: path the editor is served from, e.g. /exhibition/editor/.
// VITE_VIEWER_URL: where the published exhibitions live (open published, previews).
const singleIiifBrowser = () => singleCopy(["iiif-browser"], "@manifest-editor/shell");

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [singleIiifBrowser(), react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // The dev server pre-bundles dependencies separately from the plugins
    // above, so apply the same rule there.
    rolldownOptions: {
      plugins: [singleIiifBrowser()],
    },
  },
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
