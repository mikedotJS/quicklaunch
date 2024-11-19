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
	const { host, user, domain, email } = config;

	if (!email) {
		consola.error("Email is required in .deployrc.json configuration.");
		return;
	}

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

		spinner.start(`Checking SSL certificate status for ${domain}...`);
		const { stdout: sslExists } = await ssh.execCommand(
			`test -d /etc/letsencrypt/live/${domain} && echo "yes" || echo "no"`,
		);

		if (sslExists.trim() === "no") {
			spinner.start("Stopping Nginx for initial certificate generation...");
			await ssh.execCommand("sudo systemctl stop nginx");

			spinner.start(`Generating initial SSL certificate for ${domain}...`);
			const initialCertCommand = [
				"sudo certbot certonly",
				"--standalone",
				"--non-interactive",
				"--agree-tos",
				`--email ${email}`,
				`-d ${domain}`,
			].join(" ");

			const certResult = await ssh.execCommand(initialCertCommand);
			if (certResult.code !== 0) {
				throw new Error(
					`Certbot error: ${certResult.stderr || certResult.stdout}`,
				);
			}
			spinner.succeed("Initial SSL certificate generated.");

			await ssh.execCommand("sudo systemctl start nginx");
		}

		spinner.start(`Configuring SSL with Nginx for ${domain}...`);
		const nginxCommand = [
			"sudo certbot --nginx",
			"--non-interactive",
			"--agree-tos",
			`--email ${email}`,
			`-d ${domain}`,
			"--redirect",
		].join(" ");

		const nginxResult = await ssh.execCommand(nginxCommand);
		if (nginxResult.code !== 0) {
			throw new Error(
				`Certbot error: ${nginxResult.stderr || nginxResult.stdout}`,
			);
		}
		spinner.succeed("SSL configured with Nginx.");

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
