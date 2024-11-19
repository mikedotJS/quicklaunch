import { program } from "commander";
import deploy from "./commands/deploy";
import init from "./commands/init";
import logs from "./commands/logs";
import ssl from "./commands/ssl";

program
	.command("init")
	.description("Initialize deployment configuration")
	.action(init);

program.command("deploy").description("Deploy the application").action(deploy);

program.command("logs").description("View application logs").action(logs);

program.command("ssl").description("Set up SSL with Let’s Encrypt").action(ssl);

program.parse(process.argv);
