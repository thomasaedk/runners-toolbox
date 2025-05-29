#!/usr/bin/env python3
"""
GPX file processor for comparing two running routes.
This is a placeholder implementation that creates a simple comparison visualization.
"""

import sys
import os

# Set matplotlib backend before importing pyplot (for headless operation)
import matplotlib
matplotlib.use('Agg')

import gpxpy
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
from datetime import datetime

def parse_gpx_file(file_path):
    """Parse a GPX file and extract track points."""
    with open(file_path, 'r') as gpx_file:
        gpx = gpxpy.parse(gpx_file)
    
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                points.append({
                    'lat': point.latitude,
                    'lon': point.longitude,
                    'ele': point.elevation,
                    'time': point.time
                })
    
    return points

def create_comparison_plot(points1, points2, output_path):
    """Create a comparison visualization of two GPX tracks."""
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # Extract coordinates
    lats1 = [p['lat'] for p in points1]
    lons1 = [p['lon'] for p in points1]
    lats2 = [p['lat'] for p in points2]
    lons2 = [p['lon'] for p in points2]
    
    # Plot both routes
    ax.plot(lons1, lats1, 'b-', linewidth=2, label='Route 1', alpha=0.7)
    ax.plot(lons2, lats2, 'r-', linewidth=2, label='Route 2', alpha=0.7)
    
    # Mark start and end points
    if lons1 and lats1:
        ax.plot(lons1[0], lats1[0], 'bo', markersize=8, label='Route 1 Start')
        ax.plot(lons1[-1], lats1[-1], 'bs', markersize=8, label='Route 1 End')
    
    if lons2 and lats2:
        ax.plot(lons2[0], lats2[0], 'ro', markersize=8, label='Route 2 Start')
        ax.plot(lons2[-1], lats2[-1], 'rs', markersize=8, label='Route 2 End')
    
    # Set equal aspect ratio and labels
    ax.set_aspect('equal')
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    ax.set_title('GPX Route Comparison')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # Add some basic statistics
    if points1 and points2:
        stats_text = f"Route 1: {len(points1)} points\\nRoute 2: {len(points2)} points"
        ax.text(0.02, 0.98, stats_text, transform=ax.transAxes, 
                verticalalignment='top', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()

def main():
    print(f"GPX Processor started with args: {sys.argv}")
    
    if len(sys.argv) != 4:
        print("Usage: python3 gpx_processor.py <file1.gpx> <file2.gpx> <output.png>")
        sys.exit(1)
    
    file1_path = sys.argv[1]
    file2_path = sys.argv[2]
    output_path = sys.argv[3]
    
    print(f"Input files: {file1_path}, {file2_path}")
    print(f"Output path: {output_path}")
    
    # Check if input files exist
    if not os.path.exists(file1_path):
        print(f"Error: File does not exist: {file1_path}")
        sys.exit(1)
    
    if not os.path.exists(file2_path):
        print(f"Error: File does not exist: {file2_path}")
        sys.exit(1)
    
    try:
        print("Parsing GPX files...")
        # Parse both GPX files
        points1 = parse_gpx_file(file1_path)
        points2 = parse_gpx_file(file2_path)
        
        print(f"Points found - File1: {len(points1)}, File2: {len(points2)}")
        
        if not points1:
            print("Error: No track points found in first GPX file")
            sys.exit(1)
        
        if not points2:
            print("Error: No track points found in second GPX file")
            sys.exit(1)
        
        print("Creating comparison plot...")
        # Create comparison plot
        create_comparison_plot(points1, points2, output_path)
        
        # Verify output file was created
        if os.path.exists(output_path):
            print(f"SUCCESS: Comparison image saved to: {output_path}")
            print(f"Output file size: {os.path.getsize(output_path)} bytes")
        else:
            print(f"ERROR: Output file was not created: {output_path}")
            sys.exit(1)
        
    except Exception as e:
        print(f"Error processing GPX files: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()