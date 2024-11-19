import fs from "node:fs";
import path from "node:path";
import { NodeSSH } from "node-ssh";
import consola from "consola";
import ora from "ora";

const ssh = new NodeSSH();

const deploy = async () => {
	const spinner = ora({
		text: "Starting deployment process... 🚀",
		color: "blue",
	}).start();

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

		spinner.start(
			`Ensuring the deployment directory exists at ${deploymentPath}...`,
		);
		await ssh.execCommand(`mkdir -p ${deploymentPath}`);
		spinner.succeed("Deployment directory is ready.");

		spinner.start("Uploading project files...");
		await ssh.putDirectory("./", deploymentPath, {
			recursive: true,
			concurrency: 10,
			validate: (itemPath) => !itemPath.includes("node_modules"),
		});
		spinner.succeed("Files uploaded successfully.");

		spinner.start("Installing dependencies...");

		await ssh.execCommand("npm install", { cwd: deploymentPath });

		spinner.succeed("Dependencies installed.");

		spinner.start("Starting the application...");
		const appName = config.appName || "my-app";
		const { stdout } = await ssh.execCommand(`pm2 id ${appName}`);

		const pm2Command =
			stdout === "[]"
				? `pm2 start npm --name ${appName} --watch -- start`
				: `pm2 restart ${appName}`;

		await ssh.execCommand(pm2Command, { cwd: deploymentPath });
		spinner.succeed("Application started/restarted successfully.");

		if (domain) {
			spinner.start(`Configuring Nginx for domain: ${domain}...`);
			const nginxConfig = `server {
        server_name ${domain};
        location / {
            proxy_pass http://localhost:${port};
            proxy_http_version 1.1;
            proxy_set_header Upgrade \\$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \\$host;
            proxy_cache_bypass \\$http_upgrade;
        }
        listen 80;
        listen 443 ssl;  # Added SSL listening
        
        # Include SSL configuration if exists
        include /etc/letsencrypt/options-ssl-nginx.conf;
        ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    }`;

			const nginxPath = `/etc/nginx/sites-available/${domain}`;
			const nginxSymlink = `/etc/nginx/sites-enabled/${domain}`;

			try {
				const { stdout: existingConfig } = await ssh.execCommand(
					`sudo cat ${nginxPath} 2>/dev/null || echo ""`,
				);

				if (existingConfig && existingConfig.trim() === nginxConfig.trim()) {
					spinner.info("Nginx configuration unchanged, reloading service...");
					const reloadResult = await ssh.execCommand(
						"sudo systemctl reload nginx",
					);
					if (reloadResult.code !== 0) {
						throw new Error(`Failed to reload Nginx: ${reloadResult.stderr}`);
					}
				} else {
					const nginxConfigResult = await ssh.execCommand(
						`sudo tee ${nginxPath} > /dev/null`,
						{ stdin: nginxConfig },
					);
					if (nginxConfigResult.code !== 0) {
						throw new Error(
							`Failed to write Nginx config: ${nginxConfigResult.stderr}`,
						);
					}

					const symlinkResult = await ssh.execCommand(
						`sudo ln -sf ${nginxPath} ${nginxSymlink}`,
					);
					if (symlinkResult.code !== 0) {
						throw new Error(
							`Failed to create symlink: ${symlinkResult.stderr}`,
						);
					}

					const nginxReloadResult = await ssh.execCommand(
						"sudo nginx -t && sudo systemctl reload nginx",
					);
					if (nginxReloadResult.code !== 0) {
						throw new Error(
							`Failed to reload Nginx: ${nginxReloadResult.stderr}`,
						);
					}
				}
			} catch (error) {
				spinner.fail("Failed to apply Nginx configuration.");
				throw error;
			}
			spinner.succeed("Nginx configuration applied successfully.");
		}

		spinner.succeed("Deployment completed successfully! 🎉");
	} catch (err) {
		consola.error("Deployment failed:", err);
	} finally {
		ssh.dispose();
	}
};

export default deploy;
