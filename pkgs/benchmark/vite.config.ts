import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// https://vite.dev/config/
export default defineConfig({
	plugins: [reactRouter(), wasm(), topLevelAwait()],
	worker: {
		format: "es",
		plugins: () => [wasm(), topLevelAwait()],
	},
});
