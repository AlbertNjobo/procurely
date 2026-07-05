FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source code
COPY . .

# Build the app
RUN pnpm build

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
