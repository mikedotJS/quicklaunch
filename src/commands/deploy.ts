import fs from "node:fs";
import path from "node:path";
import { NodeSSH } from "node-ssh";

const ssh = new NodeSSH();

const deploy = async () => {
	console.log("Starting deployment process... 🚀");

	const configPath = path.resolve(process.cwd(), ".deployrc.json");
	if (!fs.existsSync(configPath)) {
		console.error(
			"Configuration file not found. Please run `quicklaunch init` first.",
		);
		return;
	}

	const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	const { host, user, path: deploymentPath, port, domain } = config;

	try {
		console.log("Connecting to the server...");
		const privateKeyPath = path.resolve(process.env.HOME || "~", ".ssh/id_rsa");

		// Verify the key exists before attempting to use it
		if (!fs.existsSync(privateKeyPath)) {
			throw new Error(`SSH private key not found at ${privateKeyPath}`);
		}

		// Read the private key with proper error handling
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
		console.log("Connected successfully.");

		console.log(
			`Ensuring the deployment directory exists at ${deploymentPath}...`,
		);
		await ssh.execCommand(`mkdir -p ${deploymentPath}`);
		console.log("Deployment directory is ready.");

		console.log("Uploading project files...");
		await ssh.putDirectory("./", deploymentPath, {
			recursive: true,
			concurrency: 10,
			validate: (itemPath) => !itemPath.includes("node_modules"),
		});
		console.log("Files uploaded successfully.");

		console.log("Installing dependencies...");
		await ssh.execCommand("npm install", { cwd: deploymentPath });
		console.log("Dependencies installed.");

		console.log("Starting the application...");
		const pm2Command = `pm2 start npm --name ${
			config.appName || "my-app"
		} --watch -- start`;
		await ssh.execCommand(pm2Command, { cwd: deploymentPath });
		console.log("Application started successfully.");

		if (domain) {
			console.log(`Configuring Nginx for domain: ${domain}...`);
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
			console.log("Nginx configuration applied successfully.");
		}

		console.log("Deployment completed successfully! 🎉");
	} catch (err) {
		console.error("Deployment failed:", err);
	} finally {
		ssh.dispose();
	}
};

export default deploy;
