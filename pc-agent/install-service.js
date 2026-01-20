const path = require('path');
const Service = require('node-windows').Service;

// Create a new service object
const svc = new Service({
  name: 'PocketClaude Agent',
  description: 'PC Agent for PocketClaude - enables remote Claude Code access',
  script: path.join(__dirname, 'dist', 'index.js'),
  nodeOptions: [],
  workingDirectory: __dirname,
  env: [
    {
      name: 'RELAY_URL',
      value: 'wss://pocketclaude-production.up.railway.app'
    },
    {
      name: 'RELAY_TOKEN',
      value: 'bdf2858f0e664e1e882cdb19814800fdc27effd53a4db61ae1effb47f7e5900c'
    }
  ]
});

// Listen for install events
svc.on('install', () => {
  console.log('Service installed successfully!');
  console.log('Starting service...');
  svc.start();
});

svc.on('start', () => {
  console.log('Service started!');
  console.log('');
  console.log('The PocketClaude Agent is now running as a Windows service.');
  console.log('It will automatically start when Windows boots.');
  console.log('');
  console.log('To check status: Open Services (services.msc) and look for "PocketClaude Agent"');
});

svc.on('alreadyinstalled', () => {
  console.log('Service is already installed.');
});

svc.on('error', (err) => {
  console.error('Error:', err);
});

// Install the service
console.log('Installing PocketClaude Agent as a Windows service...');
console.log('This may require administrator privileges.');
console.log('');
svc.install();
