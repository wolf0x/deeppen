# DeepPen Architecture

## Overview

DeepPen is an autonomous CTF challenge solver powered by DeepAgents. It uses a multi-layered architecture with real-time streaming, automatic optimization, and iterative refinement.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Web UI (port 3000)                         │
│  Kanban │ Chat │ Tasks │ Writeups │ Skills │ Settings        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP + SSE
┌────────────────────────┴────────────────────────────────────┐
│                    API Server (port 4000)                     │
│  TaskManager │ ChatService │ LoopAgent │ GuidanceStore        │
│  ConfigStore │ StreamBridge │ WriteupGenerator │ MCPManager  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    DeepAgents Runtime                         │
│  Agent Loop │ Middleware Stack │ Skills │ Tools               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ GuidanceInjector │ StreamEmitter │ ProgressTracker    │   │
│  │ RabbitHoleEscape │ FlagExtractor │ ToolTracker        │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    Container & MCP Layer                      │
│  Docker (nmap, sqlmap, curl, python) │ MCP Servers            │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. TaskManager
- Task lifecycle: create, start, pause, resume, stop, retry
- Agent execution via `runCTFAgent()`
- Stream event persistence and broadcast
- User context injection for task guidance

### 2. ChatService
- Quick task intake via natural language
- Direct LLM call (no tools, fast response)
- Auto-creates tasks from user descriptions

### 3. Loop Agent v2
- CRON-driven autonomous iteration
- Goal → State → Decide → Act → Verify → Converge loop
- Injects guidance into running agents via GuidanceStore
- Convergence detection and stall prevention

### 4. GuidanceStore
- Shared state between Loop Agent and main agent
- Loop Agent writes guidance, main agent reads via middleware
- Enables real-time course correction without stopping the agent

## Agent Execution Flow

```
User creates task
       ↓
TaskManager.start()
       ↓
runCTFAgent() → createDeepAgent({
  model, tools, skills, backend,
  middleware: [GuidanceInjector, StreamEmitter, ProgressTracker, RabbitHoleEscape]
})
       ↓
Agent.invoke() → DeepAgents ReAct loop
       ↓
┌─────────────────────────────────────────┐
│  For each iteration:                     │
│  1. GuidanceInjector checks for guidance │
│  2. Model generates response             │
│  3. StreamEmitter captures events        │
│  4. Tool executes                        │
│  5. Result feeds back to model           │
│  6. Repeat until done                    │
└─────────────────────────────────────────┘
       ↓
TaskManager sets final status
```

## Loop Agent Flow

```
CRON (every 5 min)
       ↓
findActiveTasks()
       ↓
processTask() for each:
  ├─ readTaskState() → flags, tools, thinking, errors
  ├─ getLoopSession() → create if needed
  ├─ checkConvergence() → active/completed/stalled
  ├─ analyzeAndDecide() → LLM analysis
  └─ executeDecision():
      ├─ "none" → let agent work
      ├─ "guide" → write guidance to GuidanceStore
      ├─ "redirect" → write new direction to GuidanceStore
      └─ "stop" → stop the task
```

## Middleware Stack

### StreamEmitter
- `wrapModelCall`: captures agent-response events
- `wrapToolCall`: captures tool-call and tool-result events
- Single source of truth for all stream events

### GuidanceInjector
- `wrapModelCall`: checks GuidanceStore for new guidance
- Appends guidance as SystemMessage to LLM context
- Enables real-time course correction

### ProgressTracker
- `wrapModelCall`: records tool usage and approach changes
- Feeds data to writeup generator

### RabbitHoleEscape
- `wrapModelCall`: enforces iteration/time limits
- Injects pivot instructions when stuck

## Data Flow

```
Task Created → DB (tasks table)
     ↓
Agent Runs → StreamEmitter → stream_events table → SSE → UI
     ↓
Loop Agent reads stream_events → analyzes → writes to guidance_store
     ↓
Main Agent reads guidance_store → adjusts approach
     ↓
Task Completes → DB (tasks table) → WriteupGenerator
```

## Skills System

Skills are loaded from `/skills/` directory (mounted in Docker container). Each skill is a `SKILL.md` file with YAML frontmatter.

Category mapping:
- `web` → ctf-web, ctf-writeup
- `pwn` → ctf-pwn, ctf-writeup
- `crypto` → ctf-crypto, ctf-writeup
- `forensics` → ctf-forensics, ctf-writeup
- `misc` → ctf-misc, ctf-writeup

## Database Schema

| Table | Purpose |
|-------|---------|
| tasks | Task metadata and status |
| stream_events | Real-time agent activity |
| settings | Application configuration |
| loop_sessions | Loop Agent task tracking |
| loop_iterations | Loop Agent iteration history |
| guidance_store | Shared guidance between Loop Agent and main agent |
| model_configs | LLM provider configurations |
| skills | Skill registry |
| writeups | Generated writeups |
