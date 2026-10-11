import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', '*'); res.end(); return; }
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => { writeFileSync(new URL('./Export.csv', import.meta.url), Buffer.concat(chunks)); res.end('ok'); console.log('saved', Buffer.concat(chunks).length, 'bytes'); setTimeout(() => process.exit(0), 300); });
});
server.listen(8765, '127.0.0.1', () => console.log('listening'));
setTimeout(() => process.exit(1), 120000);
