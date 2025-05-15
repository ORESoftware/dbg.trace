// grandchild_task.js
const fs = require('fs');
const path = require('path');

console.log(`    --> Grandchild Task (PID: ${process.pid}) started.`);

setTimeout(() => {
  console.log(`    --> Grandchild (PID: ${process.pid}): Doing some file I/O...`);
  try {
    fs.writeFileSync(path.join(__dirname, 'grandchild_output.txt'), `Grandchild data ${new Date()}\n`);
  } catch (err) { console.error(`    --> Grandchild (PID: ${process.pid}): File I/O error:`, err); }
}, 1000);

setTimeout(() => {
  console.log(`    --> Grandchild Task (PID: ${process.pid}) exiting after 3 seconds.`);
  process.exit(0);
}, 3000);
