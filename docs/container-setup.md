# Container Setup Guide

## Overview

DeepPen uses a Docker container to run CTF tools (nmap, sqlmap, curl, python, etc.) in a sandboxed environment. The container is pre-configured with security tools and mounts the skills directory.

## Quick Setup

### 1. Start the container

```bash
# Using docker-compose (recommended)
docker compose up -d

# Or manually
docker run -d \
  --name pentest-lab \
  --network host \
  -v $(pwd)/skills:/skills:ro \
  -v /tmp/deeppen-workspace:/workspace \
  kalilinux/kali-rolling \
  sleep infinity
```

### 2. Install tools in the container

```bash
docker exec pentest-lab apt-get update
docker exec pentest-lab apt-get install -y nmap sqlmap curl python3 python3-pip netcat-openbsd
```

### 3. Verify the setup

```bash
# Check container status
docker ps --filter name=pentest-lab

# Check tools are available
docker exec pentest-lab nmap --version
docker exec pentest-lab sqlmap --version
docker exec pentest-lab python3 --version

# Check skills are mounted
docker exec pentest-lab ls /skills/
```

## Container Configuration

The container configuration is stored in the DeepPen database and can be modified via the UI at **Config → Container**.

| Setting | Default | Description |
|---------|---------|-------------|
| Image | `kalilinux/kali-rolling` | Docker image |
| Name | `pentest-lab` | Container name |
| Network | `host` | Network mode (host = access localhost) |
| Memory | `4g` | Memory limit |
| CPUs | 2 | CPU limit |

## Skills Mount

Skills are mounted read-only at `/skills/` in the container:

```bash
-v /path/to/deeppen/skills:/skills:ro
```

The agent automatically loads skills based on the challenge category:
- `web` → `/skills/ctf-web/`, `/skills/ctf-writeup/`
- `pwn` → `/skills/ctf-pwn/`, `/skills/ctf-writeup/`
- `crypto` → `/skills/ctf-crypto/`, `/skills/ctf-writeup/`
- `forensics` → `/skills/ctf-forensics/`, `/skills/ctf-writeup/`
- `misc` → `/skills/ctf-misc/`, `/skills/ctf-writeup/`

## Network Configuration

### Host Network (Recommended)

Using `--network host` allows the container to access services on the host machine:

```bash
docker run -d --name pentest-lab --network host ...
```

This means:
- `localhost:3001` in the container = `localhost:3001` on the host
- The agent can access web applications running on the host

### Bridge Network (Default)

Using bridge network isolates the container:

```bash
docker run -d --name pentest-lab ...
```

To access host services, use `host.docker.internal`:
```bash
docker exec pentest-lab curl http://host.docker.internal:3001/
```

## Troubleshooting

### Container not starting

```bash
# Check container logs
docker logs pentest-lab

# Remove and recreate
docker rm -f pentest-lab
docker compose up -d
```

### Tools not available

```bash
# Install missing tools
docker exec pentest-lab apt-get update
docker exec pentest-lab apt-get install -y <tool-name>
```

### Skills not loading

```bash
# Check if skills are mounted
docker exec pentest-lab ls /skills/

# Check if SKILL.md exists
docker exec pentest-lab cat /skills/ctf-web/SKILL.md | head -5
```

### Network issues

```bash
# Check if container can reach host
docker exec pentest-lab curl -s http://localhost:3001/

# If using bridge network
docker exec pentest-lab curl -s http://host.docker.internal:3001/
```
