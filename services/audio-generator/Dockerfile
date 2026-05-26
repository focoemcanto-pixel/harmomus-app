FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg rubberband-cli \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/audio-generator/package.json ./package.json
RUN npm install

COPY services/audio-generator ./

CMD ["npm", "start"]
