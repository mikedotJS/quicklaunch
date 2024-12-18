import fs from "node:fs";
import path from "node:path";
import { confirm, input } from "@inquirer/prompts";
import consola from "consola";

interface DeployConfig {
	host: string;
	user: string;
	path: string;
	domain?: string;
	port: number;
	appName: string;
	email: string;
}

const init = async () => {
	consola.start("Welcome to QuickLaunch initialization! 🚀");

	try {
		const host = await input({
			message: "Enter the server IP or domain:",
			validate: (value) => value.trim() !== "" || "Host is required.",
		});

		const user = await input({
			message: "Enter the SSH username:",
			default: "root",
			validate: (value) => value.trim() !== "" || "Username is required.",
		});

		const deploymentPath = await input({
			message: "Enter the deployment directory on the server:",
			default: "/var/www/app",
			validate: (value) =>
				value.trim() !== "" || "Deployment path is required.",
		});

		const domain = await input({
			message: "Enter your domain name (leave blank if not using a domain):",
		});

		const port = await input({
			message: "Enter the application port:",
			default: "3000",
			validate: (value) => {
				const num = Number.parseInt(value, 10);
				return num > 0 || "Port must be a positive number.";
			},
			transformer: (value) => Number.parseInt(value, 10).toString(),
		});

		const appName = await input({
			message: "Enter the application name:",
			validate: (value) =>
				value.trim() !== "" || "Application name is required.",
		});

		const email = await input({
			message: "Enter your email (for SSL certificates):",
			validate: (value) => {
				if (value.trim() === "") return "Email is required.";

				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				return emailRegex.test(value) || "Please enter a valid email address.";
			},
		});

		const confirmSave = await confirm({
			message: "Save this configuration?",
			default: true,
		});

		if (!confirmSave) {
			consola.warn("Configuration was not saved.");
			return;
		}

		const config: DeployConfig = {
			host,
			user,
			path: deploymentPath,
			domain: domain || undefined,
			port: Number(port),
			appName,
			email,
		};

		const configPath = path.resolve(process.cwd(), ".deployrc.json");
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

		consola.success(`Configuration saved to ${configPath}`);
		consola.info("You can now deploy your app using `quicklaunch deploy`.");
	} catch (error) {
		consola.error("Error initializing configuration:", error);
	}
};

export default init;
