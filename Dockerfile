FROM node:18-slim

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the code
COPY . .

# Expose Strapi default port
EXPOSE 8080

# Start Strapi in development mode
CMD ["npm", "run", "develop"]

