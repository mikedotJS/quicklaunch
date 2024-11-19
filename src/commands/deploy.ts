import fs from "node:fs";
import path from "node:path";
import { NodeSSH } from "node-ssh";
import consola from "consola";

const ssh = new NodeSSH();

const deploy = async () => {
	consola.start("Starting deployment process... 🚀");

	const configPath = path.resolve(process.cwd(), ".deployrc.json");
	if (!fs.existsSync(configPath)) {
		consola.error(
			"Configuration file not found. Please run `quicklaunch init` first.",
		);
		return;
	}

	const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	const { host, user, path: deploymentPath, port, domain } = config;

	try {
		consola.info("Connecting to the server...");
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
		consola.success("Connected successfully.");

		consola.info(
			`Ensuring the deployment directory exists at ${deploymentPath}...`,
		);
		await ssh.execCommand(`mkdir -p ${deploymentPath}`);
		consola.success("Deployment directory is ready.");

		consola.info("Uploading project files...");
		await ssh.putDirectory("./", deploymentPath, {
			recursive: true,
			concurrency: 10,
			validate: (itemPath) => !itemPath.includes("node_modules"),
		});
		consola.success("Files uploaded successfully.");

		consola.info("Installing dependencies...");
		await ssh.execCommand("npm install", { cwd: deploymentPath });
		consola.success("Dependencies installed.");

		consola.info("Starting the application...");
		const pm2Command = `pm2 start npm --name ${
			config.appName || "my-app"
		} --watch -- start`;
		await ssh.execCommand(pm2Command, { cwd: deploymentPath });
		consola.success("Application started successfully.");

		if (domain) {
			consola.info(`Configuring Nginx for domain: ${domain}...`);
			const nginxConfig = `
server {
    server_name ${domain};
    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    listen 80;
}
      `;

			const nginxPath = `/etc/nginx/sites-available/${domain}`;
			const nginxSymlink = `/etc/nginx/sites-enabled/${domain}`;

			await ssh.execCommand(`echo '${nginxConfig}' > ${nginxPath}`);
			await ssh.execCommand(`ln -s ${nginxPath} ${nginxSymlink}`);
			await ssh.execCommand("nginx -t && systemctl reload nginx");
			consola.success("Nginx configuration applied successfully.");
		}

		consola.success("Deployment completed successfully! 🎉");
	} catch (err) {
		consola.error("Deployment failed:", err);
	} finally {
		ssh.dispose();
	}
};

export default deploy;
