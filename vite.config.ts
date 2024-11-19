import { defineConfig } from "vite";

export default defineConfig({
	optimizeDeps: {
		// Pre-bundle dependencies for faster startup
		include: ["commander", "node-ssh", "dotenv", "inquirer"],
	},
});
