import { NodeSSH } from "node-ssh";
import path from "node:path";
import fs from "node:fs";
import consola from "consola";
import ora from "ora";

const ssh = new NodeSSH();

const setupSSL = async () => {
	const configPath = path.resolve(process.cwd(), ".deployrc.json");
	if (!fs.existsSync(configPath)) {
		consola.error(
			"Configuration file not found. Please run `quicklaunch init` first.",
		);
		return;
	}

	const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	const { host, user, domain } = config;

	const spinner = ora({
		text: `Setting up SSL for domain: ${domain}...`,
		color: "cyan",
	}).start();

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
		});
		spinner.succeed("Connected successfully.");

		spinner.start("Installing Certbot...");
		await ssh.execCommand(
			"sudo apt update && sudo apt install -y certbot python3-certbot-nginx",
		);
		spinner.succeed("Certbot installed.");

		spinner.start(`Generating SSL certificate for ${domain}...`);

		const certbotCommand = [
			"sudo certbot --nginx",
			"--non-interactive",
			"--agree-tos",
			"--email mchlrmn@me.com",
			`-d ${domain}`,
			"--redirect",
		].join(" ");

		const certbotResult = await ssh.execCommand(certbotCommand);

		if (certbotResult.code !== 0) {
			throw new Error(
				`Certbot error: ${certbotResult.stderr || certbotResult.stdout}`,
			);
		}
		spinner.succeed(`SSL certificate generated for ${domain}.`);

		spinner.start("Restarting Nginx...");
		await ssh.execCommand("sudo systemctl restart nginx");
		spinner.succeed("Nginx restarted with SSL configuration.");

		consola.success(`SSL setup completed successfully for ${domain}!`);
	} catch (err) {
		spinner.fail("SSL setup failed.");
		if (err instanceof Error) {
			consola.error(err.message);
		} else {
			consola.error("An unknown error occurred.");
		}
	} finally {
		ssh.dispose();
	}
};

export default setupSSL;
