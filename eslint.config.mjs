import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Data and generated output — not source. The raw Twitter archive ships
    // ~134MB of .js data files, which ESLint will try to parse and run out of
    // memory on, so leaving these out is what keeps `npm run lint` working.
    "bluesky-twitter-archive/**",
    "db-backups/**",
    "data/**",
    "council-dates/**",
    "designbrief/**",
    "votecard-maker/samples/**",
    ".kv-store.json",
  ]),
]);

export default eslintConfig;
