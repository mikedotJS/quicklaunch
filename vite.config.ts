import { defineConfig } from "vite";

export default defineConfig({
	optimizeDeps: {
		include: [
			"commander",
			"node-ssh",
			"@inquirer/prompts",
			"cli-progress",
			"consola",
			"ora",
		],
	},
});
