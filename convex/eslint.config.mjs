import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  {
    ignores: ["**/node_modules/**", "**/_generated/**"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends("prettier"),
];
