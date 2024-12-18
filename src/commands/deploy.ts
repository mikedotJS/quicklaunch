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
			const { stdout: sslExists } = await ssh.execCommand(
				`sudo test -d "/etc/letsencrypt/live/${domain}" || sudo test -d "/etc/letsencrypt/renewal/${domain}" && echo "yes" || echo "no"`,
			);

			const { stdout: certLocation } = await ssh.execCommand(`
				if sudo test -d "/etc/letsencrypt/live/${domain}"; then 
					echo "live"
				elif sudo test -d "/etc/letsencrypt/renewal/${domain}"; then 
					echo "renewal"
				else 
					echo "none"
				fi
			`);

			const certPath =
				certLocation.trim() === "live"
					? `/etc/letsencrypt/live/${domain}`
					: `/etc/letsencrypt/renewal/${domain}`;

			const nginxConfig = `server {
				server_name ${domain};
				location / {
					proxy_pass http://localhost:${port};

					proxy_connect_timeout 300;
					proxy_send_timeout 300;
					proxy_read_timeout 300;
					send_timeout 300;
					
					proxy_http_version 1.1;
					proxy_set_header Connection "";
					keepalive_timeout 300;
					keepalive_requests 100;
					
					proxy_set_header Host \\$host;
					proxy_set_header X-Real-IP \\$remote_addr;
					proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
					proxy_set_header X-Forwarded-Proto \\$scheme;
					proxy_set_header Upgrade \\$http_upgrade;
					proxy_cache_bypass \\$http_upgrade;
					
					proxy_buffer_size 128k;
					proxy_buffers 4 256k;
					proxy_busy_buffers_size 256k;
				}
				listen 80;
				${
					sslExists.trim() === "yes"
						? `
				listen 443 ssl;
				include /etc/letsencrypt/options-ssl-nginx.conf;
 				ssl_certificate ${certPath}/fullchain.pem;
    			ssl_certificate_key ${certPath}/privkey.pem;
				`
						: ""
				}
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
