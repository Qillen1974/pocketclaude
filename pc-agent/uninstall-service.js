const path = require('path');
const Service = require('node-windows').Service;

// Create a new service object
const svc = new Service({
  name: 'PocketClaude Agent',
  script: path.join(__dirname, 'dist', 'index.js'),
});

// Listen for uninstall events
svc.on('uninstall', () => {
  console.log('Service uninstalled successfully!');
  console.log('The PocketClaude Agent service has been removed.');
});

svc.on('stop', () => {
  console.log('Service stopped.');
});

svc.on('error', (err) => {
  console.error('Error:', err);
});

// Uninstall the service
console.log('Uninstalling PocketClaude Agent service...');
svc.uninstall();
