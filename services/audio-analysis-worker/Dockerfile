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
RUN pip install --upgrade pip

RUN pip install wheel setuptools

RUN pip install --no-cache-dir \
    numpy \
    librosa \
    soundfile

COPY package*.json ./
RUN npm install

COPY . .

CMD ["./startup.sh"]
