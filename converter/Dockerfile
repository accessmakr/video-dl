FROM node:20-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install dependencies
COPY package.json .
RUN npm install --production

# Copy source
COPY . .

# Create temp directories
RUN mkdir -p /tmp/uploads /tmp/outputs

EXPOSE 3001

CMD ["node", "server.js"]
