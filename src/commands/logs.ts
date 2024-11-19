import fs from "node:fs";
import path from "node:path";
import { NodeSSH } from "node-ssh";
import ora from "ora";

const ssh = new NodeSSH();

const logs = async () => {
	const spinner = ora({
		text: "Starting log retrieval process...",
		color: "blue",
	}).start();

	const configPath: string = path.resolve(process.cwd(), ".deployrc.json");
	let config: Record<string, string>;
	try {
		if (!fs.existsSync(configPath)) {
			throw new Error("Configuration file not found");
		}

		config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	} catch (err) {
		spinner.fail(
			`Configuration file not found. Please run "quicklaunch init" first.`,
		);
		return;
	}

	const { host, user } = config;

	try {
		spinner.start("Connecting to the server...");
		const privateKeyPath = path.resolve(process.env.HOME || "~", ".ssh/id_rsa");

		if (!fs.existsSync(privateKeyPath)) {
			throw new Error(`SSH private key not found at ${privateKeyPath}`);
		}

		const privateKey = fs.readFileSync(privateKeyPath, "utf8");

		await ssh.connect({
			host,
			username: user,
			privateKey,
			port: 22,
			tryKeyboard: true,
			onKeyboardInteractive: (
				name: string,
				instructions: string,
				instructionsLang: string,
				prompts: Array<{ prompt: string; echo: boolean }>,
				finish: (responses: string[]) => void,
			) => {
				if (prompts.length > 0) {
					finish([process.env.SSH_PASSWORD || ""]);
				}
			},
		});

		spinner.succeed("Connected successfully.");

		spinner.start("Retrieving logs...");
		const appName = config.appName || "my-app";

		const checkApp = await ssh.execCommand(`pm2 id ${appName}`);
		if (checkApp.stderr || !checkApp.stdout) {
			spinner.fail(`App ${appName} not found in PM2 processes`);
			return;
		}

		await new Promise(() => {
			spinner.succeed("Logs retrieved successfully.");

			ssh.exec("pm2", ["logs", appName, "--raw"], {
				onStdout: (chunk) => {
					process.stdout.write(chunk.toString("utf8"));
				},
				onStderr: (chunk) => {
					process.stderr.write(chunk.toString("utf8"));
				},
			});
		});
	} catch (err: unknown) {
		if (err instanceof Error) {
			spinner.fail(`Failed to retrieve logs: ${err.message}`);
		} else {
			spinner.fail("Failed to retrieve logs: An unknown error occurred.");
		}
	} finally {
		ssh.dispose();
	}
};

export default logs;
