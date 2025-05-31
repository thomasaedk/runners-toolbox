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

def create_comparison_plot(points1, points2, output_path, file1_path, file2_path, map_type='satellite'):
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
    
    # Get combined bounds of both routes
    combined_bounds = gdf1_mercator.total_bounds
    gdf2_bounds = gdf2_mercator.total_bounds
    combined_bounds = [
        min(combined_bounds[0], gdf2_bounds[0]),  # min x
        min(combined_bounds[1], gdf2_bounds[1]),  # min y
        max(combined_bounds[2], gdf2_bounds[2]),  # max x
        max(combined_bounds[3], gdf2_bounds[3])   # max y
    ]
    
    # Calculate padding for legend (15% of width and height)
    width = combined_bounds[2] - combined_bounds[0]
    height = combined_bounds[3] - combined_bounds[1]
    legend_padding_x = width * 0.15
    legend_padding_y = height * 0.10
    
    # Create the plot with optimized size for web display (fills tool-container width)
    fig, ax = plt.subplots(figsize=(16, 10))

    # Plot the routes (no markers, no labels)
    file1_basename = os.path.basename(file1_path)
    file2_basename = os.path.basename(file2_path)
    gdf1_mercator.plot(ax=ax, color='blue', linewidth=3, alpha=0.8, label=os.path.basename(os.path.splitext(file1_basename)[0]))
    gdf2_mercator.plot(ax=ax, color='red', linewidth=3, alpha=0.8, label=os.path.basename(os.path.splitext(file2_basename)[0]))
    
    # Set plot bounds with padding for legend and satellite image text
    bottom_padding = height * 0.10  # Extra padding at bottom for satellite image attribution text
    ax.set_xlim(combined_bounds[0] - width * 0.05, combined_bounds[2] + legend_padding_x)
    ax.set_ylim(combined_bounds[1] - bottom_padding, combined_bounds[3] + legend_padding_y)

    # Add basemap based on map_type selection
    try:
        if map_type == 'satellite':
            ctx.add_basemap(ax, crs=gdf1_mercator.crs.to_string(), source=ctx.providers.Esri.WorldImagery, zoom='auto', alpha=0.6)
            # Apply greyscale and brightness filter to the current axes
            for im in ax.get_images():
                im.set_cmap('gray')
                # Increase brightness by adjusting the color mapping
                im.set_clim(vmin=0, vmax=180)  # Brightens the image
        else:  # street map
            ctx.add_basemap(ax, crs=gdf1_mercator.crs.to_string(), source=ctx.providers.OpenStreetMap.Mapnik, zoom='auto', alpha=0.7)
    except Exception as e:
        print(f"Warning: Could not load {map_type} imagery, using OpenStreetMap instead: {e}")
        ctx.add_basemap(ax, crs=gdf1_mercator.crs.to_string(), source=ctx.providers.OpenStreetMap.Mapnik, zoom='auto', alpha=0.6)

    # Remove axis labels and ticks
    ax.set_xlabel('')
    ax.set_ylabel('')
    ax.set_xticks([])
    ax.set_yticks([])
    
    # Position legend in upper right with margin from plot edges
    ax.legend(
        loc='upper right',
        bbox_to_anchor=(0.98, 0.98),
        borderaxespad=0.3
    )
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='white', format='jpeg', pil_kwargs={'quality': 95})
    plt.close()

def main():
    print(f"GPX Processor started with args: {sys.argv}")
    
    if len(sys.argv) < 4 or len(sys.argv) > 5:
        print("Usage: python3 gpx_processor.py <file1.gpx> <file2.gpx> <output.jpg> [map_type]")
        sys.exit(1)
    
    file1_path = sys.argv[1]
    file2_path = sys.argv[2]
    output_path = sys.argv[3]
    map_type = sys.argv[4] if len(sys.argv) == 5 else 'satellite'
    
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
        
        print(f"Creating comparison plot with {map_type} background...")
        # Create comparison plot
        create_comparison_plot(points1, points2, output_path, file1_path, file2_path, map_type)
        
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