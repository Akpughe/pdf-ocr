# Use the official Node.js 20 image as the base
FROM node:20

# Set the working directory inside the container
WORKDIR /usr

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy the rest of the application files
COPY . ./

# Expose the port used by the Hono server
EXPOSE 4000

CMD ["npx", "concurrently", "npm:dev", "npm:start"]