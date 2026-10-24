import viteConfig from "./vite.config";

export default {
  ...viteConfig,
  // Browser layout and complete-show flows run separately with Playwright.
  test: { server: { deps: { inline: [/@aether\//] } }, include: ["src/**/*.test.{ts,tsx}"] },
};
