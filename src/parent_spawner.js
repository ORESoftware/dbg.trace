// parent_spawner.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log(`Parent Spawner (PID: ${process.pid}) starting... Will spawn a child in 2s.`);

setTimeout(() => {
  console.log(`Parent (PID: ${process.pid}): Spawning child_worker.js...`);
  const child = spawn(process.execPath, [path.join(__dirname, 'child_worker.js')], {
    stdio: 'inherit'
  });

  child.on('spawn', () => {
    console.log(`Parent (PID: ${process.pid}): child_worker.js spawned with PID: ${child.pid}`);
  });
  child.on('error', (err) => console.error(`Parent: Error spawning child: ${err}`));
  child.on('exit', (code) => {
    console.log(`Parent (PID: ${process.pid}): child_worker.js (PID: ${child.pid}) exited with code ${code}.`);
  });

  setTimeout(() => {
    console.log(`Parent (PID: ${process.pid}): Doing some file I/O...`);
    try {
      fs.writeFileSync(path.join(__dirname, 'parent_output.txt'), `Parent data ${new Date()}\n`);
    } catch (err) { console.error(`Parent (PID: ${process.pid}): File I/O error:`, err); }
  }, 2000);

}, 2000);

setTimeout(() => {
  console.log(`Parent Spawner (PID: ${process.pid}) exiting after 12 seconds.`);
  process.exit(0);
}, 12000);
