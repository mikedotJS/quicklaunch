# QuickLaunch 🚀

QuickLaunch is a streamlined CLI tool for deploying Node.js applications to remote servers. It simplifies the deployment process by handling SSH connections, file transfers, dependency management, and server configuration.

## Features

- 🔧 Easy configuration setup
- 📦 Automated deployment process
- 🔄 PM2 process management
- 🌐 Nginx configuration for domains
- 🔒 SSL certificate automation
- 📊 Real-time log viewing
- 🔐 Secure SSH key authentication

## Installation

```
npm install -g @weirdsience/quicklaunch
```

## Prerequisites

- Node.js (v18 or higher)
- SSH key pair configured on your local machine
- PM2 installed on the remote server
- Nginx installed on the remote server (if using domain configuration)

## Usage

### Initialize Configuration

Set up your deployment configuration:

```
quicklaunch init
```

This will guide you through setting up:
- Server host/IP
- SSH username
- Deployment directory
- Domain name (optional)
- Application port
- App name

### Deploy Your Application

Deploy your Node.js application:

```
quicklaunch deploy
```

This command:
1. Connects to your server via SSH
2. Creates the deployment directory
3. Uploads your project files
4. Installs dependencies
5. Starts your application with PM2
6. Configures Nginx (if domain is specified)

### Set Up SSL Certificate

Secure your domain with a free Let's Encrypt SSL certificate:

```
quicklaunch ssl
```

This command:
1. Installs Certbot if not present
2. Generates SSL certificates for your domain
3. Configures Nginx with SSL settings
4. Sets up automatic HTTPS redirection

### View Application Logs

Monitor your application logs in real-time:

```
quicklaunch logs
```

## Configuration

QuickLaunch stores its configuration in `.deployrc.json` in your project root. Example configuration:

```
{
  "host": "your-server.com",
  "user": "root",
  "path": "/var/www/app",
  "domain": "yourdomain.com",
  "port": 3000,
  "appName": "myapp"
}
```

## Development

### Setup

1. Clone the repository
2. Install dependencies:
```
npm install
```

### Available Scripts

- `npm start` - Run the CLI locally
- `npm run dev` - Run with watch mode
- `npm run build` - Build for production
- `npm run format` - Format code with Biome
- `npm run lint` - Lint code
- `npm run check` - Run Biome checks

## Security

- Uses SSH key authentication
- Supports password-protected SSH keys
- Secure file transfers
- Environment variable support for sensitive data

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Author

Mike Romain