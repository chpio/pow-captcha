import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import wasm from "vite-plugin-wasm";

// https://vite.dev/config/
export default defineConfig({
	plugins: [reactRouter(), wasm()],
	worker: {
		format: "es",
		plugins: () => [wasm()],
	},
});
