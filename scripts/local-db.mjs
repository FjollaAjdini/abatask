// Starts a local MongoDB on 127.0.0.1:27017 with data in ./data/mongo.
// Uses the mongod binary that mongodb-memory-server downloads, so no system install is needed.
// For production use MongoDB Atlas or a system install and set MONGODB_URI instead.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, 'node_modules', '.cache', 'mongodb-memory-server');
const bin = fs.existsSync(cache) && fs.readdirSync(cache).find((f) => f.startsWith('mongod-') && !f.endsWith('.lock'));
if (!bin) {
  console.error('No local mongod binary found yet. Run once:  npm install && node -e "import(\'mongodb-memory-server\').then(async m => { const s = await m.MongoMemoryServer.create(); await s.stop(); })"');
  process.exit(1);
}
const dbpath = path.join(root, 'data', 'mongo');
fs.mkdirSync(dbpath, { recursive: true });
const child = spawn(path.join(cache, bin), ['--dbpath', dbpath, '--bind_ip', '127.0.0.1', '--port', process.env.MONGO_PORT || '27017'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
