# Multi-stage build for Runner's Toolbox
FROM node:18-alpine AS frontend-build

# Set working directory for frontend build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install frontend dependencies (including dev dependencies for build)
RUN npm ci

# Copy frontend source code
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./
COPY vite.config.js ./

# Build frontend for production
RUN npm run build

# Production stage
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    supervisor \
    libexpat1-dev \
    libxml2-dev \
    libxslt1-dev \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy backend requirements and install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy built frontend from build stage
COPY --from=frontend-build /app/dist ./frontend/

# Create uploads directory for backend
RUN mkdir -p backend/uploads

# Create a simple HTTP server script for serving frontend
RUN echo '#!/bin/sh\ncd /app/frontend && python3 -m http.server 5173' > /app/serve-frontend.sh && \
    chmod +x /app/serve-frontend.sh

# Create supervisor configuration
RUN mkdir -p /etc/supervisor/conf.d
COPY <<EOF /etc/supervisor/conf.d/supervisord.conf
[unix_http_server]
file=/var/run/supervisor.sock
chmod=0700

[supervisord]
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
childlogdir=/var/log/supervisor
nodaemon=true
user=root

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///var/run/supervisor.sock

[program:backend]
command=python3 app.py
directory=/app/backend
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/backend.err.log
stdout_logfile=/var/log/supervisor/backend.out.log
environment=FLASK_ENV=production

[program:frontend]
command=/app/serve-frontend.sh
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/frontend.err.log
stdout_logfile=/var/log/supervisor/frontend.out.log
EOF

# Create log directory
RUN mkdir -p /var/log/supervisor

# Expose ports
EXPOSE 5000 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5173/ && \
      curl -f http://localhost:5000/api/health || exit 1

# Default command
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]