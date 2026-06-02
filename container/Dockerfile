FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    # Core tools
    curl wget git vim jq netcat-openbsd \
    # Network scanning
    nmap masscan \
    # Web tools
    nikto sqlmap hydra gobuster ffuf \
    # Password cracking
    john hashcat \
    # Binary exploitation
    gdb strace ltrace binutils file \
    hexedit radare2 \
    # Forensics
    volatility3 \
    # Python
    python3 python3-pip python3-venv \
    # Misc
    smbclient enum4linux \
    && rm -rf /var/lib/apt/lists/*

# Python CTF tools
RUN pip3 install --break-system-packages --no-cache-dir \
    pwntools \
    requests \
    beautifulsoup4 \
    pycryptodome \
    scapy \
    z3-solver \
    angr \
    flask

# Metasploit (optional, takes a long time to install)
# RUN apt-get update && apt-get install -y metasploit-framework && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspace
WORKDIR /workspace

CMD ["tail", "-f", "/dev/null"]
