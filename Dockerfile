FROM node:20-slim AS base

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install necessary build tools for some native dependencies (like bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
COPY . .

# Install dependencies and build both API server and frontend
RUN pnpm install
RUN pnpm run build

FROM base
WORKDIR /app
COPY --from=build /app /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Start the API server (which now also serves the frontend)
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
