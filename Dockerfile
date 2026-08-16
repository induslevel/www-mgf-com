FROM node:22

WORKDIR /app

# Disable Cloudflare adapter for local dev in Docker
ENV USE_CLOUDFLARE=false
ENV ASTRO_TELEMETRY_DISABLED=1

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --registry https://registry.npmjs.org/ --legacy-peer-deps

# Copy the rest of the files
COPY . .

# Expose the port Astro uses
EXPOSE 4323

# We do NOT remove src/pages/api because the Node adapter supports SSR APIs
# Run the build and preview server exposed to all network interfaces
CMD ["sh", "-c", "npm run build && npx astro preview --host --port 4323"]
