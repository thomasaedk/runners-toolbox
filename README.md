# Runner's Toolbox

A web application providing essential tools for runners, including GPX file comparison and route analysis.

## Features

- **GPX Compare Tool**: Upload two .gpx files to generate route comparison visualizations
- **Additional Tools**: Placeholder components for future runner-focused features
- Clean, responsive interface with tab-based navigation

## Architecture

- **Frontend**: React with Vite for fast development
- **Backend**: Python Flask API for GPX processing
- **Visualization**: matplotlib for generating comparison charts

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Python 3.8 or higher
- pip (Python package manager)
- Docker (optional, for containerized deployment)

### Installation & Running

#### Option 1: Docker (Recommended)

##### Quick Start with Docker
```bash
# Build and run the container
docker build -t runners-toolbox .
docker run -p 5173:5173 -p 5000:5000 runners-toolbox
```

**When the container is ready:**
- You'll see log messages indicating both services have started:
  ```
  [program:backend] started with pid X
  [program:frontend] started with pid Y
  ```
- The container will be healthy when both services are responding (may take 30-60 seconds)

**Access the application at:**
- **Main website**: http://localhost:5173
- Backend API: http://localhost:5000 (for development/debugging)

##### Docker with custom name
```bash
# Build the image
docker build -t runners-toolbox .

# Run with custom container name
docker run -d --name runners-toolbox-app -p 5173:5173 -p 5000:5000 runners-toolbox

# View logs to see when it's ready
docker logs runners-toolbox-app

# Check if container is healthy
docker ps

# Stop the container
docker stop runners-toolbox-app
```

#### Option 2: Manual Development Setup

##### 1. Install Frontend Dependencies
```bash
npm install
```

##### 2. Install Backend Dependencies
```bash
cd backend
pip3 install -r requirements.txt
cd ..
```

##### 3. Start the Backend Server
```bash
cd backend
python3 app.py
```
The Flask server will start on http://localhost:5000

##### 4. Start the Frontend Development Server
In a new terminal:
```bash
npm run dev
```
The React app will start on http://localhost:5173

### Usage

**Once the application is running (Docker or manual setup):**

1. **Open your web browser** and navigate to **http://localhost:5173**
2. You should see the Runner's Toolbox homepage with language selection
3. Click on the "GPX Compare" tab to use the main tool
4. Upload two .gpx files using the file upload areas
5. Click "Compare Routes" to generate a visualization
6. View the comparison image showing both routes overlaid

**Note**: The application supports both English and Danish languages, automatically detecting your browser's language preference.

## Development

- Frontend files are in `src/`
- Backend files are in `backend/`
- The frontend automatically proxies API requests to the backend
- Hot reload is enabled for both frontend and backend development

### Docker Development

#### Option A: Development with Hot Reload (Recommended for development)

For the best development experience with hot reloading and auto-refresh:

```bash
# Start both frontend and backend with hot reload
docker-compose -f docker-compose.dev.yml up

# Or run in detached mode
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop services
docker-compose -f docker-compose.dev.yml down
```

**Features:**
- ✅ **Frontend hot reload**: Changes to React code automatically refresh the browser
- ✅ **Backend hot reload**: Flask development server restarts automatically on Python changes
- ✅ **Volume mounts**: Edit code on your host machine, see changes instantly
- ✅ **Separate services**: Frontend and backend run in separate containers

#### Option B: Production Image with Volume Mounts

For testing the production build with some code editing capability:

```bash
# Build the production image
docker build -t runners-toolbox .

# Run with volume mounts (limited hot reload)
docker run -p 5173:5173 -p 5000:5000 \
  -v $(pwd)/backend:/app/backend \
  runners-toolbox
```

**Note**: This serves pre-built frontend files, so frontend changes require container restart.

## API Endpoints

- `POST /api/compare-gpx` - Upload two GPX files and receive comparison image
- `GET /api/health` - Health check endpoint

## Localization

The application supports multiple languages:
- **English** (default)
- **Danish** (Dansk)

Language is automatically detected based on browser settings, with Danish users seeing the Danish interface by default. Users can manually switch languages using the dropdown in the header. Language preferences are saved in localStorage.
