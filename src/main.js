#!/usr/bin/env node

const { spawn } = require('child_process');
const os = require('os');

// --- Argument Parsing ---
if (process.argv.length < 3) {
  console.error("Usage: ./debug_trace.js <PID_to_trace>");
  console.error("Example: ./debug_trace.js 12345");
  process.exit(1);
}

const targetPidStr = process.argv[2];
const targetPid = parseInt(targetPidStr, 10);

if (isNaN(targetPid) || targetPid <= 0) {
  console.error(`Invalid PID: '${targetPidStr}'. PID must be a positive integer.`);
  process.exit(1);
}

console.log(`[DEBUG_TRACE] Attempting to trace PID: ${targetPid} and its children/grandchildren.`);

let tracerProcess;
let killedByDebugTrace = false; // Flag to manage exit reason

// --- Tracer Logic ---
function startTracer(pid) {
  const platform = os.platform();
  let tracerCmd, tracerArgs;

  console.log(`[DEBUG_TRACE] Platform: ${platform}`);

  if (platform === 'darwin') { // macOS
    tracerCmd = 'sudo'; // dtrace usually needs sudo
    tracerArgs = [
      'dtrace',
      '-F', // <-- Key flag: Follow forks
      '-p', pid.toString(),
      '-qn', // -q (quiet), -n (name of D script)
      // D script:
      // walltimestamp: absolute time
      // pid: process ID making the syscall (correctly reflects child PID with -F)
      // basename(curpsinfo->pr_fname): short executable name (e.g., "node")
      // probefunc: syscall name
      // arg0, arg1: first two arguments to the syscall
      'syscall:::entry { printf("%Y [PID:%d %s] syscall: %s (args: 0x%X, 0x%X, ...)\\n", walltimestamp, pid, basename(curpsinfo->pr_fname), probefunc, arg0, arg1); }'
    ];
    console.warn("[DEBUG_TRACE] On macOS, dtrace requires sudo. You might be prompted for your password.");
  } else if (platform === 'linux') {
    tracerCmd = 'strace'; // May need sudo or CAP_SYS_PTRACE
    tracerArgs = [
      '-p', pid.toString(),
      '-f',          // <-- Key flag: Follow forks/clones
      // strace -f automatically prefixes output lines with the PID of the process making the syscall.
      '-tt',         // Print microsecond-resolution timestamps
      '-T',          // Print time spent in syscall
      '-e', 'trace=all', // Trace all syscalls.
      '-s', '128'      // Print first 128 chars of strings (default 32 can be too short)
    ];
    console.warn("[DEBUG_TRACE] On Linux, strace might require sudo or appropriate capabilities if ptrace_scope is restrictive.");
    console.warn("[DEBUG_TRACE] If strace fails with 'Operation not permitted', try running this script with sudo.");
  } else {
    console.error(`[DEBUG_TRACE] Syscall tracing for children not automatically supported for platform: ${platform}.`);
    process.exit(1);
  }

  console.log(`[DEBUG_TRACE] Starting tracer: ${tracerCmd} ${tracerArgs.join(' ')}`);

  tracerProcess = spawn(tracerCmd, tracerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'] // stdin, stdout, stderr
  });

  tracerProcess.stdout.on('data', (data) => {
    // Output directly to this script's stdout
    process.stdout.write(data);
  });

  tracerProcess.stderr.on('data', (data) => {
    // Filter out common/expected "process exited/detached" messages from tracer
    const SANE_TRACER_EXIT_MSGS = [
      /dtrace: pid \d+ has exited/,
      /dtrace: process \d+ exited/, // dtrace might also say this for children
      /strace: Process \d+ detached/,
      /strace: exit_group\([\d\?]+\) = \?/, // strace output when a traced process exits
      /strace: \S+ \([\d\?]+\) exited with [\d\?]+/, // e.g., "clone (1234) exited with 0" or "--- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=1234, ...}"
      /strace: child \d+ exited with/,
      /strace: <... \S+ resumed>/, // e.g. <... nanosleep resumed>
      /ptrace\(PTRACE_SEIZE, \d+\): No such process/i // If target exits very quickly
    ];
    const dataStr = data.toString();
    const dataStrLower = dataStr.toLowerCase(); // For case-insensitive matching

    if (!SANE_TRACER_EXIT_MSGS.some(regex => regex.test(dataStrLower))) {
      process.stderr.write(`[TRACER_STDERR] ${dataStr}`);
    } else {
      // console.log(`[DEBUG_TRACE] Tracer info (normal on target/child exit): ${dataStr.trim()}`);
    }
  });

  tracerProcess.on('error', (err) => {
    console.error(`[DEBUG_TRACE] Failed to start tracer '${tracerCmd}': ${err.message}`);
    console.error("[DEBUG_TRACE] This could be due to permissions (try with sudo), the tool not being installed, or the target PID not existing/accessible.");
    process.exit(1); // Critical error, exit debug_trace
  });

  tracerProcess.on('exit', (code, signal) => {
    console.log(`[DEBUG_TRACE] Tracer process '${tracerCmd}' exited with code ${code}, signal ${signal}.`);
    if (!killedByDebugTrace) {
      console.log("[DEBUG_TRACE] Tracer exited (likely target process and children terminated), so debug_trace is exiting.");
      process.exit(code === null ? (signal ? 0 : 1) : code); // Propagate exit code or use 0 if by signal (e.g. target ended)
    } else {
      console.log("[DEBUG_TRACE] Tracer exited as requested by debug_trace.");
      // The cleanupAndExit function's timeout will handle exiting debug_trace.js
    }
  });
}

// Start the tracer
startTracer(targetPid);

// --- Graceful Shutdown for debug_trace itself ---
function cleanupAndExit(signal) {
  console.log(`\n[DEBUG_TRACE] Received ${signal}. Cleaning up...`);
  if (tracerProcess && !tracerProcess.killed) {
    console.log('[DEBUG_TRACE] Terminating tracer process...');
    killedByDebugTrace = true; // Mark that we initiated the kill
    tracerProcess.kill('SIGINT'); // dtrace/strace should detach cleanly from all PIDs
  }
  // Give a brief moment for tracer to react and for its 'exit' event to fire.
  // Then, ensure debug_trace.js exits.
  setTimeout(() => {
    console.log("[DEBUG_TRACE] Exiting.");
    process.exit(0); // Exit debug_trace.js successfully
  }, 500);
}

process.on('SIGINT', () => cleanupAndExit('SIGINT'));  // Ctrl+C in debug_trace terminal
process.on('SIGTERM', () => cleanupAndExit('SIGTERM'));
