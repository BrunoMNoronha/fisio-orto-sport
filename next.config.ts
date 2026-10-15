import type { NextConfig } from "next";
import { realpathSync } from "node:fs";
import { relative } from "node:path";

// Trace the physical pnpm directory, never children below its symlink alias.
// Vercel must not receive both a directory and a symlink at the same path.
const validatorDirectory = relative(process.cwd(), realpathSync("node_modules/libxml2-wasm")).replaceAll("\\", "/");
const validatorFiles = `./${validatorDirectory}/**/*`;

const nextConfig: NextConfig = {
  env: { TISS_XML_VALIDATOR_MODULE: `${validatorDirectory}/lib/index.mjs` },
  serverExternalPackages:['libxml2-wasm'],
  outputFileTracingIncludes:{'/administrativo/lotes/*':['./src/modules/administrativo/tiss/xml-worker.mjs','./src/modules/administrativo/tiss/schemas/**/*',validatorFiles],'/api/administrativo/lotes/*':['./src/modules/administrativo/tiss/xml-worker.mjs','./src/modules/administrativo/tiss/schemas/**/*',validatorFiles]},
};

export default nextConfig;
