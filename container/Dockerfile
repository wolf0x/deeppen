FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    curl wget nmap netcat-openbsd \
    sqlmap \
    john \
    binutils file \
    gdb \
    git \
    vim \
    jq \
    hexedit \
    strace ltrace \
    && rm -rf /var/lib/apt/lists/*

# Python CTF tools
RUN pip3 install --no-cache-dir \
    pwntools \
    requests \
    beautifulsoup4 \
    pycryptodome \
    scapy \
    z3-solver \
    angr

# Create workspace
RUN mkdir -p /workspace
WORKDIR /workspace

# Keep container alive
CMD ["tail", "-f", "/dev/null"]
