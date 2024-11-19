import { program } from "commander";
import deploy from "./commands/deploy";
import init from "./commands/init";
import logs from "./commands/logs";
// import rollback from "./commands/rollback";
// import nginx from "./commands/nginx";
// import ssl from "./commands/ssl";

program
	.command("init")
	.description("Initialize deployment configuration")
	.action(init);

program.command("deploy").description("Deploy the application").action(deploy);

program.command("logs").description("View application logs").action(logs);

// program
//   .command("rollback")
//   .description("Rollback to the last working version")
//   .action(rollback);

// program
//   .command("nginx")
//   .description("Manage Nginx configuration")
//   .action(nginx);

// program.command("ssl").description("Set up SSL with Let’s Encrypt").action(ssl);

program.parse(process.argv);
