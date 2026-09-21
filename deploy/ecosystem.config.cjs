// PM2 process file. Run from the app root: pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [{
    name: "memdb-oracle",
    script: "node_modules/.bin/tsx",
    args: "agent/server.ts",
    cwd: __dirname + "/..",
    instances: 1,            // ONE process: the per-IP/global daily caps are in-memory
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "300M",
    env: { NODE_ENV: "production", PORT: 8787 },
    // secrets come from .env in the app root (loaded by dotenv), never from here
  }],
};
