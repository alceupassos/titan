// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.turbo/**", "**/coverage/**", "**/node_modules/**"],
  },
  {
    rules: {
      // Dinheiro nunca é `number` cru — reforçado também pelo hook block-money-float.mjs,
      // esta regra é a rede de segurança em tempo de lint.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
