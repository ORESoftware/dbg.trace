// child_worker.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log(`  -> Child Worker (PID: ${process.pid}) started.`);

setTimeout(() => {
  console.log(`  -> Child (PID: ${process.pid}): Doing some file I/O...`);
  try {
    fs.writeFileSync(path.join(__dirname, 'child_output.txt'), `Child data ${new Date()}\n`);
  } catch (err) { console.error(`  -> Child (PID: ${process.pid}): File I/O error:`, err); }
}, 1500);

setTimeout(() => {
  console.log(`  -> Child (PID: ${process.pid}): Spawning grandchild_task.js...`);
  const grandchild = spawn(process.execPath, [path.join(__dirname, 'grandchild_task.js')], {
    stdio: 'inherit'
  });
  grandchild.on('spawn', () => {
    console.log(`  -> Child (PID: ${process.pid}): grandchild_task.js spawned with PID: ${grandchild.pid}`);
  });
  grandchild.on('error', (err) => console.error(`Child: Error spawning grandchild: ${err}`));
  grandchild.on('exit', (code) => {
    console.log(`  -> Child (PID: ${process.pid}): grandchild_task.js (PID: ${grandchild.pid}) exited with code ${code}.`);
  });
}, 3000); // Child spawns grandchild 3s after it starts

setTimeout(() => {
  console.log(`  -> Child Worker (PID: ${process.pid}) exiting after 8 seconds.`);
  process.exit(0);
}, 8000);
