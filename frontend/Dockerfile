FROM node:18-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies (all dependencies included for build)
RUN npm install

# Copy application source
COPY . .

# Build Next.js
RUN npm run build

# Run in production
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "next", "start", "-p", "3000"]
