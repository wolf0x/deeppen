---
name: pwn
description: Binary exploitation methodology for CTF challenges. Use when the challenge involves buffer overflows, format strings, ROP chains, or heap exploitation.
---

# Pwn/Binary Exploitation CTF Skill

## Methodology

### 1. Static Analysis
- Use `execute` to run `file` command on the binary
- Use `execute` to run `checksec` to identify protections (NX, ASLR, PIE, canary)
- Use `execute` to run `objdump -d` or `readelf -a` for binary analysis
- Look for vulnerable functions: `gets`, `strcpy`, `sprintf`, `scanf`, `system`
- Identify buffer sizes and stack layout

### 2. Dynamic Analysis
- Run the binary with various inputs using `execute`
- Test for buffer overflow: send increasing lengths of 'A' characters
- Identify the exact offset to overwrite return address (use cyclic patterns)
- Check for format string vulnerabilities: send `%x.%x.%x` or `%p.%p.%p`
- Use `execute` to run `ltrace` for library call tracing

### 3. Exploitation
- **Buffer Overflow**: Craft payload to overwrite return address
- **Format String**: Use `%n` to write to arbitrary addresses
- **ROP Chain**: Build ROP gadgets to bypass NX
- **Heap Exploitation**: Use after free, double free, heap overflow
- **ret2libc**: Leak libc address, call system("/bin/sh")

### 4. Payload Development
- Use Python with pwntools via `execute` tool:
  ```python
  from pwn import *
  p = process('./vuln')
  payload = b'A' * offset + p64(0x4011b0)  # ret address
  p.sendline(payload)
  p.interactive()
  ```

### 5. Flag Extraction
- The flag is usually in a file on the server (e.g., `flag.txt`)
- Read it after getting a shell: `cat /home/user/flag.txt`
- Or the program prints it after exploitation

## Common Tools
- `execute` for running exploit scripts and analysis tools
- `read_file` for reading binary files
- `grep` for searching strings in binaries
- Python with pwntools for exploit development

## Key Addresses to Find
- Buffer address (for overwrites)
- System/puts GOT entries (for ret2plt)
- `/bin/sh` string address (for ret2libc)
- Libc base address (for ROP chains)
