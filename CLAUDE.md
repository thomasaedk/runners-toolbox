# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Runner's Toolbox is a React-based web application that provides useful tools for runners. The project consists of a React frontend built with Vite and a Python Flask backend for processing GPX files.

## Development Commands

### Frontend (React)
- `npm install` - Install dependencies
- `npm run dev` - Start development server (http://localhost:5173)
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Backend (Python Flask)
- `cd backend && pip3 install -r requirements.txt` - Install Python dependencies
- `cd backend && python3 app.py` - Start Flask server (http://localhost:5000)

## Architecture

### Frontend Structure
- React components in `src/components/`
- Main layout in `src/App.jsx` with tab-based navigation
- CSS styling in `src/App.css`
- Vite configuration includes proxy to Flask backend

### Backend Structure
- Flask API server in `backend/app.py`
- GPX file processing script in `backend/gpx_processor.py`
- File uploads handled via `/api/compare-gpx` endpoint
- Uses matplotlib for generating comparison visualizations

### Key Features
1. **GPX Compare Tool**: Upload two .gpx files to generate route comparison visualization
2. **Tool 2 & 3**: Placeholder components for future runner tools

### API Endpoints
- `POST /api/compare-gpx` - Upload two GPX files and receive comparison image
- `GET /api/health` - Health check endpoint

## Development Workflow

1. Start backend: `cd backend && python3 app.py`
2. Start frontend: `npm run dev`
3. Frontend proxies API requests to backend via Vite configuration