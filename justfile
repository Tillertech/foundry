set dotenv-load := true

default:
    @just --list

# Run development server
develop:
    docker compose -f docker-compose.local.yml up

# Build local development
build:
    docker compose -f docker-compose.local.yml build --no-cache

# Rebuild and restart a specific service (usage: just rebuild app)
rebuild service:
    docker compose -f docker-compose.local.yml build --no-cache {{ service }}

# Kill containers and remove volumes
reset:
    docker compose -f docker-compose.local.yml down -v --remove-orphans

# Build and run containers
build-develop:
    docker compose -f docker-compose.local.yml up --build

# Run Prisma Studio
studio:
    docker compose -f docker-compose.local.yml up studio

# Run Prisma migration with a name (usage: just migrate "migration-name")
migrate name:
    docker compose -f docker-compose.local.yml exec foundryapi sh -c "npx prisma migrate dev --name='{{ name }}'"

# Alternative: Run Prisma migration with optional name (defaults to "unnamed_migration" if not provided)
migrate-alt name="unnamed_migration":
    docker compose -f docker-compose.local.yml exec foundryapi sh -c "npx prisma migrate dev --name='{{ name }}'"

# Show status of migrations
status:
    docker compose -f docker-compose.local.yml exec foundryapi sh -c "npx prisma migrate status"

# Generate Prisma client
generate:
    docker compose -f docker-compose.local.yml exec foundryapi sh -c "npx prisma generate"
