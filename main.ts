// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122.
// Runs every /input/<id>/program.bin on its input.bin and writes
// /output/<id>/stdout.bin + /output/<id>/exit.txt, per ISA v1.
// Local run: MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const OUT = new Uint8Array(65536);
let OUT_LEN = 0;

// Runs one program; returns its exit code (0-255, trap code on trap)
// and leaves its output in OUT[0..OUT_LEN).
function runVM(prog, input) {
  const stack = new Int32Array(256);
  let sp = 0;
  const calls = new Int32Array(64);
  let cp = 0;
  const mem = new Int32Array(256);
  OUT_LEN = 0;
  let inPos = 0;
  let pc = 0;
  let steps = 0;
  const enc = new TextEncoder();
  while (true) {
    if (steps >= 1000000) return 10;
    if (pc < 0 || pc >= prog.length) return 9;
    const op = prog[pc];
    // Immediate length, and whether the byte is a known opcode.
    let imm = 0;
    let known = true;
    if (op === 0x01) imm = 1;
    else if (op === 0x02) imm = 4;
    else if (op === 0x30 || op === 0x31 || op === 0x32 || op === 0x33) imm = 2;
    else if (
      op !== 0x00 && op !== 0x03 && op !== 0x04 && op !== 0x05 && op !== 0x06 &&
      op !== 0x07 && op !== 0x10 && op !== 0x11 && op !== 0x12 && op !== 0x13 &&
      op !== 0x14 && op !== 0x15 && op !== 0x16 && op !== 0x17 && op !== 0x18 &&
      op !== 0x19 && op !== 0x1a && op !== 0x1b && op !== 0x1c && op !== 0x1d &&
      op !== 0x1e && op !== 0x20 && op !== 0x21 && op !== 0x22 && op !== 0x34 &&
      op !== 0x40 && op !== 0x41 && op !== 0x50 && op !== 0x51 && op !== 0x52 &&
      op !== 0x53
    ) known = false;
    if (!known) return 5;
    if (pc + imm >= prog.length) return 9;
    steps++;
    const next = pc + 1 + imm;
    // Pops / pushes for the stack checks (before the instruction's own traps).
    let pops = 0, pushes = 0;
    if (op === 0x01 || op === 0x02 || op === 0x52) pushes = 1;
    else if (
      op === 0x03 || op === 0x17 || op === 0x1b || op === 0x40 || op === 0x50 ||
      op === 0x51 || op === 0x53 || op === 0x31 || op === 0x32
    ) pops = 1;
    else if (op === 0x04) { pops = 1; pushes = 2; }
    else if (op === 0x05 || op === 0x06) { pops = 2; pushes = 2; }
    else if (op === 0x07) { pops = 3; pushes = 3; }
    else if (op === 0x41) pops = 2;
    else if (
      (op >= 0x10 && op <= 0x16) || (op >= 0x18 && op <= 0x1e) || (op >= 0x20 && op <= 0x22)
    ) { pops = 2; pushes = 1; }
    if (sp < pops) return 2;
    if (sp - pops + pushes > 256) return 3;
    pc = next;
    if (op === 0x00) return 0;
    if (op === 0x01) { stack[sp++] = (prog[next - 1] << 24) >> 24; continue; }
    if (op === 0x02) {
      stack[sp++] = prog[next - 4] | (prog[next - 3] << 8) | (prog[next - 2] << 16) | (prog[next - 1] << 24);
      continue;
    }
    if (op === 0x03) { sp--; continue; }
    if (op === 0x04) { stack[sp] = stack[sp - 1]; sp++; continue; }
    if (op === 0x05) { const t = stack[sp - 1]; stack[sp - 1] = stack[sp - 2]; stack[sp - 2] = t; continue; }
    if (op === 0x06) { stack[sp] = stack[sp - 2]; sp++; continue; }
    if (op === 0x07) {
      const a = stack[sp - 3]; stack[sp - 3] = stack[sp - 2]; stack[sp - 2] = stack[sp - 1]; stack[sp - 1] = a;
      continue;
    }
    if (op === 0x17) { stack[sp - 1] = -stack[sp - 1] | 0; continue; }
    if (op === 0x1b) { stack[sp - 1] = ~stack[sp - 1]; continue; }
    if ((op >= 0x10 && op <= 0x16) || (op >= 0x18 && op <= 0x1e) || (op >= 0x20 && op <= 0x22)) {
      const b = stack[sp - 1], a = stack[sp - 2];
      let r = 0;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op === 0x13) {
        if (b === 0) return 4;
        r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
      } else if (op === 0x14) {
        if (b === 0) return 4;
        r = b === -1 ? 0 : (a % b) | 0;
      } else if (op === 0x15) {
        if (b === 0) return 4;
        r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
      } else if (op === 0x16) {
        if (b === 0) return 4;
        r = ((a >>> 0) % (b >>> 0)) | 0;
      } else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << (b & 31);
      else if (op === 0x1d) r = a >> (b & 31);
      else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else if (op === 0x22) r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      sp -= 2; stack[sp++] = r;
      continue;
    }
    if (op === 0x30 || op === 0x31 || op === 0x32) {
      const rel = ((prog[next - 2] | (prog[next - 1] << 8)) << 16) >> 16;
      let take = true;
      if (op !== 0x30) { const v = stack[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
      if (take) pc = next + rel;
      continue;
    }
    if (op === 0x33) {
      if (cp === 64) return 7;
      calls[cp++] = next;
      pc = prog[next - 2] | (prog[next - 1] << 8);
      continue;
    }
    if (op === 0x34) {
      if (cp === 0) return 8;
      pc = calls[--cp];
      continue;
    }
    if (op === 0x40) {
      const addr = stack[sp - 1];
      if (addr < 0 || addr >= 256) return 6;
      stack[sp - 1] = mem[addr];
      continue;
    }
    if (op === 0x41) {
      const addr = stack[sp - 1], v = stack[sp - 2];
      if (addr < 0 || addr >= 256) return 6;
      sp -= 2; mem[addr] = v;
      continue;
    }
    if (op === 0x50) {
      const bytes = enc.encode(String(stack[sp - 1]));
      if (OUT_LEN + bytes.length > 65536) return 11;
      sp--; OUT.set(bytes, OUT_LEN); OUT_LEN += bytes.length;
      continue;
    }
    if (op === 0x51) {
      if (OUT_LEN + 1 > 65536) return 11;
      OUT[OUT_LEN++] = stack[--sp] & 255;
      continue;
    }
    if (op === 0x52) { stack[sp++] = inPos < input.length ? input[inPos++] : -1; continue; }
    if (op === 0x53) return stack[--sp] & 255;
  }
}

for (const id of readdirSync(IN_DIR).sort()) {
  const dir = join(IN_DIR, id);
  const prog = readFileSync(join(dir, 'program.bin'));
  const input = readFileSync(join(dir, 'input.bin'));
  const exit = runVM(prog, input);
  const outDir = join(OUT_DIR, id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'stdout.bin'), OUT.slice(0, OUT_LEN));
  writeFileSync(join(outDir, 'exit.txt'), String(exit) + '\n');
}
