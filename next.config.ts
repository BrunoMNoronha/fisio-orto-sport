import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages:['libxml2-wasm'],
  outputFileTracingIncludes:{'/administrativo/lotes/*':['./src/modules/administrativo/tiss/xml-worker.mjs','./src/modules/administrativo/tiss/schemas/**/*','./node_modules/libxml2-wasm/**/*'],'/api/administrativo/lotes/*':['./src/modules/administrativo/tiss/xml-worker.mjs','./src/modules/administrativo/tiss/schemas/**/*','./node_modules/libxml2-wasm/**/*']},
};

export default nextConfig;
