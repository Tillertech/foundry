set dotenv-load := true

default:
    @just --list

# Run development server
develop:
    docker compose -f docker-compose.local.yml up

# Build local development
build:
    docker compose -f docker-compose.local.yml build --no-cache

# Rebuild and restart a specific service (usage: just rebuild foundryapi)
rebuild service:
    docker compose -f docker-compose.local.yml build --no-cache {{ service }}

# Kill containers and remove volumes
reset:
    docker compose -f docker-compose.local.yml down -v --remove-orphans

# Build and run containers
build-develop:
    docker compose -f docker-compose.local.yml up --build

# Run Prisma Studio (tools profile)
studio:
    docker compose -f docker-compose.local.yml --profile tools up studio

# Run Prisma migration with a name (usage: just migrate "migration-name")
migrate name:
    docker compose -f docker-compose.local.yml exec foundryapi sh -c "npx prisma migrate dev --config=apps/api/prisma.config.ts --name='{{ name }}'"

# Alternative: Run Prisma migration with optional name (defaults to "unnamed_migration" if not provided)
migrate-alt name="unnamed_migration":
    docker compose -f docker-compose.local.yml exec foundryapi sh -c "npx prisma migrate dev --config=apps/api/prisma.config.ts --name='{{ name }}'"

# Show status of migrations
status:
    docker compose -f docker-compose.local.yml exec foundryapi sh -c "npx prisma migrate status --config=apps/api/prisma.config.ts"

# Generate Prisma client
generate:
    docker compose -f docker-compose.local.yml exec foundryapi sh -c "npx prisma generate --config=apps/api/prisma.config.ts"

# --- Production ---

# Build production images
prod-build:
    docker compose -f docker-compose.production.yml build

# Start the production stack (detached)
prod-up:
    docker compose -f docker-compose.production.yml up -d

# Stop the production stack
prod-down:
    docker compose -f docker-compose.production.yml down

# Tail production logs
prod-logs:
    docker compose -f docker-compose.production.yml logs -f

# Run production migrations manually
prod-migrate:
    docker compose -f docker-compose.production.yml exec foundryapi sh -c "npx prisma migrate deploy --config=prisma.config.ts"
