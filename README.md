# Runner's Toolbox

A web application providing essential tools for runners, including GPX file comparison and route analysis.

**🏃 Available at**: [https://runners-toolbox.up.railway.app/](https://runners-toolbox.up.railway.app/)

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

#### Option 1: Docker Only (Recommended for Quick Setup)
- **Docker** - Only requirement for running the application

**What you get:**
- ✅ Complete application (frontend + backend)
- ✅ No local development environment needed
- ✅ Consistent deployment across platforms

**What you don't get:**
- ❌ No hot reload during development
- ❌ Cannot edit code and see changes instantly
- ❌ Need to rebuild container for code changes

#### Option 2: Full Development Setup
- **Node.js** (v16 or higher)
- **Python 3.8** or higher
- **pip** (Python package manager)
- **Docker** (optional, for containerized deployment)
- **Docker Compose** (optional, for development with hot reload)

**What you get:**
- ✅ Full development environment
- ✅ Hot reload for instant code changes
- ✅ Direct access to source code
- ✅ Debugging capabilities

### Installation & Running

#### Option 1: Docker Production (Recommended for Quick Setup)

```bash
# Build and run the container
docker build -t runners-toolbox .
docker run -p 5173:5173 -p 5000:5000 runners-toolbox
```

**When the container is ready:**
- You'll see log messages indicating both services have started
- The container will be healthy when both services are responding (may take 30-60 seconds)

**Access the application at http://localhost:5173**

#### Option 2: Docker Development (Recommended for Development)

For development with hot reload and auto-refresh:

```bash
# Start both frontend and backend with hot reload
docker-compose -f docker-compose.dev.yml up

# Or run in detached mode
docker-compose -f docker-compose.dev.yml up -d
```

**Features:**
- ✅ Frontend and backend hot reload
- ✅ Edit code and see changes instantly
- ✅ Volume mounts for live code editing

#### Option 3: Manual Development Setup

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

### Docker Development Commands

```bash
# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop services
docker-compose -f docker-compose.dev.yml down
```

## API Endpoints

- `POST /api/compare-gpx` - Upload two GPX files and receive comparison image
- `GET /api/health` - Health check endpoint

## Localization

The application supports multiple languages:
- **English** (default)
- **Danish** (Dansk)

Language is automatically detected based on browser settings, with Danish users seeing the Danish interface by default. Users can manually switch languages using the dropdown in the header. Language preferences are saved in localStorage.