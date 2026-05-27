FROM node:22-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-venv \
    python3-pip \
 && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --upgrade pip

RUN pip install \
    torch \
    torchaudio \
    torchvision \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install \
    diffq \
    demucs \
    basic-pitch

COPY package*.json ./
RUN npm install

COPY . .

CMD ["./startup.sh"]
