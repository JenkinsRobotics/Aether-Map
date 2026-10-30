import viteConfig from "./vite.config";

export default {
  ...viteConfig,
  // Browser layout and complete-show flows run separately with Playwright.
  // The full editor mounts in ~2 s, but a busy machine has run past the 5 s default.
  test: { server: { deps: { inline: [/@aether\//] } }, include: ["src/**/*.test.{ts,tsx}"], testTimeout: 20000 },
};
