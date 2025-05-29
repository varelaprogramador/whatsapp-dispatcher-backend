# Base image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Bundle app source (copy only necessary files)
COPY package.json package-lock.json ./

# List files in the workdir for debugging
RUN ls -l

# Install app dependencies (only production dependencies)
RUN npm install --production

# Bundle app source (copy only necessary files)
COPY src/ ./src/
COPY server.js ./
COPY app.js ./

# Start the server
CMD [ "node", "server.js" ]

# Exposing server port (adjust if your app listens on a different port)
EXPOSE 8080