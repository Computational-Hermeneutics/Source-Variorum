# PDP-1 instruction set — a reading reference

A working reference for reading the *Spacewar!* listings in this corpus. The
DEC PDP-1 is an 18-bit machine with a single accumulator (**AC**), an
**IO** register (used for I/O, display coordinates, and the low half of
double-length arithmetic), an overflow flip-flop, six program flags, and six
console sense switches. Memory words are addressed in octal. Self-modifying code
(via `dap`/`dip`) and the in-out group (`iot`) do much of the heavy lifting.

> The same data drives Source Variorum's right-click / Alt-click **dictionary**
> in CodeX. This page is the human-readable version; right-click any mnemonic in
> a witness for the same gloss in place (and, if the token is a macro or label
> defined in that witness, the source snippet that defines it).

**Reference:** Norbert Landsteiner, "Inside Spacewar! — PDP-1 Instructions,"
masswerk.at — <https://www.masswerk.at/spacewar/inside/pdp1-instructions.html>,
after the *PDP-1 Handbook* (F-15D, DEC, Maynard 1963) with PDP-1D (1964) updates.

---

## Memory-reference instructions

These take an operand address `Y` (octal). Adding the defer bit `i` makes the
reference indirect.

| Mn. | Octal | Name | Effect |
|-----|------|------|--------|
| `lac Y` | 20 | Load AC | AC ← C(Y) |
| `lio Y` | 22 | Load IO | IO ← C(Y) |
| `dac Y` | 24 | Deposit AC | C(Y) ← AC |
| `dap Y` | 26 | Deposit Address Part | C(Y)₆₋₁₇ ← AC₆₋₁₇ (self-modifying address patch) |
| `dip Y` | 30 | Deposit Instruction Part | C(Y)₀₋₅ ← AC₀₋₅ (opcode patch) |
| `dio Y` | 32 | Deposit IO | C(Y) ← IO |
| `dzm Y` | 34 | Deposit Zero | C(Y) ← 0 |
| `add Y` | 40 | Add | AC ← AC + C(Y) (ones-complement; sets Overflow) |
| `sub Y` | 42 | Subtract | AC ← AC − C(Y) |
| `tad Y` | 36 | Two's-complement Add | AC ← AC + C(Y) (PDP-1D) |
| `idx Y` | 44 | Index | C(Y) ← C(Y)+1, also in AC |
| `isp Y` | 46 | Index and Skip if Positive | index C(Y); skip if result ≥ 0 |
| `and Y` | 02 | Logical AND | AC ← AC ∧ C(Y) |
| `ior Y` | 04 | Inclusive OR | AC ← AC ∨ C(Y) |
| `xor Y` | 06 | Exclusive OR | AC ← AC ⊕ C(Y) |
| `xct Y` | 10 | Execute | run the instruction in Y, in place |
| `sad Y` | 50 | Skip if Different | skip if AC ≠ C(Y) |
| `sas Y` | 52 | Skip if Same | skip if AC = C(Y) |
| `mus Y` | 54 | Multiply Step | one multiply step (`mul`, opt., is hardware) |
| `dis Y` | 56 | Divide Step | one divide step (`div`, opt., is hardware) |
| `jmp Y` | 60 | Jump | PC ← Y |
| `jsp Y` | 62 | Jump and Save PC | AC ← return addr, PC ← Y (subroutine call) |
| `jda Y` | 17 | Jump and Deposit AC | = `dac Y` then `jsp Y+1` |
| `cal Y` | 16 | Call | = `jda 100` (fixed-address linkage) |
| `law N` | 70 | Load AC With | AC ← N (immediate); `law i N` (71) loads −N |
| `iot Y` | 72 | In-Out Transfer | device transfer (see below) |

## Operate group (opcode 76xxxx, OR-combinable)

| Mn. | Octal | Name | Effect |
|-----|------|------|--------|
| `cla` | 760200 | Clear AC | AC ← 0 |
| `cli` | 764000 | Clear IO | IO ← 0 |
| `cma` | 761000 | Complement AC | AC ← ¬AC |
| `hlt` | 760400 | Halt | stop the processor |
| `nop` | 760000 | No Operation | do nothing one cycle |
| `lap` | 760100 | Load AC w/ PC | AC ← Program Counter |
| `lat` | 762200 | Load AC from Test | AC ← Test Word switches |
| `stf f` | 76001f | Set Flag | set program flag f |
| `clf f` | 76000f | Clear Flag | clear program flag f (`clf 7` = all) |
| `swp` | 760060 | Swap | AC ↔ IO (PDP-1D) |
| `cmi` | 770000 | Complement IO | IO ← ¬IO (PDP-1D) |

A common macro: `clc = cma+cla-opr` (clear then complement → all-ones / −0).

## Skip group (opcode 64xxxx; add `i` to invert the sense)

| Mn. | Octal | Name | Skip when… |
|-----|------|------|-----------|
| `sza` | 640100 | Skip Zero AC | AC = +0 |
| `spa` | 640200 | Skip Plus AC | AC sign positive |
| `sma` | 640400 | Skip Minus AC | AC sign negative |
| `szo` | 641000 | Skip Zero Overflow | overflow clear (and clears it) |
| `spi` | 642000 | Skip Plus IO | IO sign positive |
| `szs s` | 6400s0 | Skip Zero Sense switch | sense switch s = 0 |
| `szf f` | 64000f | Skip Zero Flag | program flag f = 0 |
| `sni` | 644000 | Skip Non-zero IO | IO ≠ 0 (PDP-1D) |
| `szi` | 654000 | Skip Zero IO | IO = 0 (PDP-1D) |

## Shift / rotate group (66xx / 67xx; count = `1s`…`9s` = 1–9 places)

`ral rar rcl rcr ril rir` rotate (circular); `sal sar scl scr sil sir` shift
(arithmetic). `a` = AC, `i` = IO, `c` = combined 36-bit AC+IO. E.g. `ral 3s`
rotates the AC left three bits; `rcr 9s` rotates the combined register right nine.

## In-out transfer (IOT) group — the devices

| Mn. | Octal | Device / effect |
|-----|------|-----------------|
| `tyo` | 720003 | type a character out (IO → typewriter) |
| `tyi` | 720004 | type a character in (→ IO) |
| `rpa` `rpb` | 720001/2 | read paper tape, alphanumeric / binary |
| `rrb` | 720030 | read the tape-reader buffer |
| `ppa` `ppb` | 720005/6 | punch paper tape, alphanumeric / binary |
| `dpy` | 720007 | **display one point** on the Type 30 CRT at (AC, IO); intensity in bits 9–11 — *the instruction that drew Spacewar!* |
| `dpp` | 720407 | display one point, ultra-precision CRT |
| `cks` | 720033 | check device status → IO |
| `esm` | 720055 | enter sequence-break (interrupt) mode |
| `lsm` | 720054 | **leave sequence-break mode** — Spacewar! runs with breaks off and polls |
| `cbs` | 720056 | clear the sequence-break system |
| `cac` | 720053 | clear all break channels |
| `iot 11` | 720011 | read the four MIT Spacewar! control boxes → IO |

(The full machine also carried card, magnetic-tape, drum, A-D, line-printer,
data-comm, and symbol-generator IOTs; see the reference for the complete list.)

## MACRO assembler directives & constants

`define name args … term` (or `macro … term`) defines a macro; `repeat n, text`
unrolls; `constants` / `variables` emit the literal pool and variable storage;
`start addr` marks the entry point. Assembler constants: `i = 10000` (the defer
bit); `1s … 9s = 1, 3, 7, 17, 37, 77, 177, 377, 777` (octal unary shift counts).
