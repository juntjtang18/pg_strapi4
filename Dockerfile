# Stage 1: Base image for building dependencies
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./

# Install only production dependencies first to enable better caching
RUN npm install --omit=dev

# Copy the rest of the code
COPY . .

# Optional: build admin panel (for production use)
# RUN npm run build

# Stage 2: Final slim image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy just the built app and dependencies from build stage
COPY --from=build /app ./

# Add production-only environment variables
#ENV NODE_ENV=production

# Expose Strapi port
EXPOSE 8080

# Start Strapi in development mode (change to 'start' for production)
CMD ["npm", "run", "develop"]


