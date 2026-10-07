// PM2 config. Uses .cjs because package.json sets "type": "module".
// Settings (PORT, MONGODB_URI, ...) are loaded from .env by dotenv in server.js.
module.exports = {
  apps: [
    {
      name: 'abatask',
      script: 'server.js',
      interpreter: '/home/ubuntu/.nvm/versions/node/v22.23.3/bin/node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
