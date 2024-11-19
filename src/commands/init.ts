import fs from "node:fs";
import path from "node:path";
import { confirm, input } from "@inquirer/prompts";

interface DeployConfig {
  host: string;
  user: string;
  path: string;
  domain?: string;
  port: number;
  appName: string;
}

const init = async () => {
  console.log("Welcome to QuickLaunch initialization! 🚀");

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

    const confirmSave = await confirm({
      message: "Save this configuration?",
      default: true,
    });

    if (!confirmSave) {
      console.log("Configuration was not saved.");
      return;
    }

    const config: DeployConfig = {
      host,
      user,
      path: deploymentPath,
      domain: domain || undefined,
      port: Number(port),
      appName,
    };

    const configPath = path.resolve(process.cwd(), ".deployrc.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`Configuration saved to ${configPath}`);
    console.log("You can now deploy your app using `quicklaunch deploy`.");
  } catch (error) {
    console.error("Error initializing configuration:", error);
  }
};

export default init;
