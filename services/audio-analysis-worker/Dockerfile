FROM node:22-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    gcc \
    g++ \
    make \
    cmake \
    git \
 && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"
ENV DEMUCS_CACHE_DIR="/opt/demucs-cache"
ENV DEMUCS_CACHE="/opt/demucs-cache"
ENV XDG_CACHE_HOME="/opt/demucs-cache"

RUN pip install --upgrade pip

RUN pip install wheel setuptools

RUN pip install \
    torch \
    torchaudio \
    torchvision \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir \
    demucs \
    basic-pitch

RUN mkdir -p "${DEMUCS_CACHE_DIR}" \
 && demucs --list-models \
 && python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

COPY package*.json ./
RUN npm install

COPY . .

CMD ["./startup.sh"]
