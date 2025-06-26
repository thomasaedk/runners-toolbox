# Multi-stage build for Runner's Toolbox
FROM node:18-alpine AS frontend-build

# Set working directory for frontend build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install frontend dependencies (including dev dependencies for build)
RUN npm ci

# Accept build argument for elevation API
ARG VITE_USE_REAL_ELEVATION=true
ENV VITE_USE_REAL_ELEVATION=${VITE_USE_REAL_ELEVATION}

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
    libexpat1-dev \
    libxml2-dev \
    libxslt1-dev \
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

# Expose port (only Flask backend needed)
EXPOSE 5000

# Health check (only check Flask backend)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Set working directory to backend
WORKDIR /app/backend

# Default command (run Flask backend only)
CMD ["python3", "app.py"]