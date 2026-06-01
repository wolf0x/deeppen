---
name: web-security
description: Web application security testing methodology for CTF challenges. Use when the challenge involves web exploitation, SQL injection, XSS, SSRF, or authentication bypass.
---

# Web Security CTF Skill

## Methodology

### 1. Reconnaissance
- Read all provided source code files carefully
- Identify input points: forms, URLs, headers, cookies, hidden fields
- Map the application structure (routes, endpoints, static files)
- Look for hidden parameters, backup files, debug endpoints
- Check robots.txt, sitemap.xml, .git directory

### 2. Analysis
- **SQL Injection**: Test with `'`, `"`, `OR 1=1`, `UNION SELECT`, time-based blind (`SLEEP(5)`)
- **XSS**: Try `<script>alert(1)</script>`, event handlers (`onerror`), template injection
- **SSRF**: Internal URLs (`http://127.0.0.1`), `file://`, `gopher://`, DNS rebinding
- **Auth Bypass**: Default credentials, JWT manipulation (alg:none, weak secret), cookie tampering
- **IDOR**: Enumerate IDs, path traversal (`../../etc/passwd`), null bytes
- **Command Injection**: `;ls`, `|whoami`, `$(id)`, backticks
- **Deserialization**: Check for pickle, Java serialization, PHP unserialize

### 3. Exploitation
- Use `execute` tool to run `curl` commands with crafted payloads
- Use `execute` tool to run `sqlmap` for automated SQL injection
- Use `read_file` to analyze source code for hardcoded secrets
- Use `grep` to search for patterns: password, secret, key, flag, admin

### 4. Flag Extraction
- Search responses for flag patterns: `flag{...}`, `CTF{...}`, `HTB{...}`
- Check database dumps for flag tables
- Look in hidden files, comments, headers, cookies
- Check error messages for leaked information

## Common Tools
- `curl` for HTTP requests with custom headers/methods
- `grep` for pattern searching in source code
- `execute` for running sqlmap, nikto, custom scripts
- `read_file` for reading source code and config files
