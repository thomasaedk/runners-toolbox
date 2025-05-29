#!/usr/bin/env python3
"""
GPX file processor for comparing two running routes.
This is a placeholder implementation that creates a simple comparison visualization.
"""

# Set matplotlib backend before importing pyplot (for headless operation)
import matplotlib
import os
import sys

matplotlib.use('Agg')

import gpxpy
import matplotlib.pyplot as plt
import numpy as np
from datetime import datetime
import contextily as ctx
import geopandas as gpd
from shapely.geometry import LineString, Point
import pandas as pd

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
    """Create a comparison visualization of two GPX tracks on satellite imagery."""
    # Extract coordinates
    lats1 = [p['lat'] for p in points1]
    lons1 = [p['lon'] for p in points1]
    lats2 = [p['lat'] for p in points2]
    lons2 = [p['lon'] for p in points2]
    
    # Combine all coordinates to determine bounds
    all_lats = lats1 + lats2
    all_lons = lons1 + lons2
    
    # Create GeoDataFrames for the routes
    route1_line = LineString(list(zip(lons1, lats1)))
    route2_line = LineString(list(zip(lons2, lats2)))
    
    # Create GeoDataFrames
    gdf1 = gpd.GeoDataFrame([1], geometry=[route1_line], crs='EPSG:4326')
    gdf2 = gpd.GeoDataFrame([1], geometry=[route2_line], crs='EPSG:4326')
    
    # Transform to Web Mercator for contextily
    gdf1_mercator = gdf1.to_crs('EPSG:3857')
    gdf2_mercator = gdf2.to_crs('EPSG:3857')
    
    # Create the plot
    fig, ax = plt.subplots(figsize=(15, 12))
    
    # Plot the routes (no markers, no labels)
    gdf1_mercator.plot(ax=ax, color='blue', linewidth=3, alpha=0.8)
    gdf2_mercator.plot(ax=ax, color='red', linewidth=3, alpha=0.8)
    
    # Add satellite basemap with greyscale and brightness adjustment
    try:
        ctx.add_basemap(ax, crs=gdf1_mercator.crs.to_string(), source=ctx.providers.Esri.WorldImagery, zoom='auto', alpha=0.6)
        # Apply greyscale and brightness filter to the current axes
        for im in ax.get_images():
            im.set_cmap('gray')
            # Increase brightness by adjusting the color mapping
            im.set_clim(vmin=0, vmax=180)  # Brightens the image
    except Exception as e:
        print(f"Warning: Could not load satellite imagery, using OpenStreetMap instead: {e}")
        ctx.add_basemap(ax, crs=gdf1_mercator.crs.to_string(), source=ctx.providers.OpenStreetMap.Mapnik, zoom='auto', alpha=0.6)
    
    # Remove axis labels and ticks
    ax.set_xlabel('')
    ax.set_ylabel('')
    ax.set_xticks([])
    ax.set_yticks([])
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight', facecolor='white')
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