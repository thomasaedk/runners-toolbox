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
import json
import math

def parse_gpx_file(file_path):
    """Parse a GPX file and extract track points."""
    with open(file_path, 'r') as gpx_file:
        gpx = gpxpy.parse(gpx_file)
    
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                # Handle datetime safely
                time_str = None
                if point.time:
                    try:
                        # Convert to ISO format string to avoid timezone issues
                        time_str = point.time.isoformat()
                    except (AttributeError, TypeError):
                        # If there's any issue with time processing, skip it
                        time_str = None
                
                points.append({
                    'lat': point.latitude,
                    'lon': point.longitude,
                    'ele': point.elevation if point.elevation is not None else 0,
                    'time': time_str
                })
    
    return points

def calculate_bearing(lat1, lon1, lat2, lon2):
    """Calculate bearing between two points in degrees."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    dlon = lon2 - lon1
    
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    
    bearing = math.atan2(y, x)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360
    
    return bearing

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters."""
    R = 6371000  # Earth's radius in meters
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c

def generate_direction_arrows(points, interval_meters=500):
    """Generate direction arrows along the route at specified intervals."""
    arrows = []
    if len(points) < 2:
        return arrows
    
    try:
        total_distance = 0
        last_arrow_distance = 0
        
        for i in range(1, len(points)):
            try:
                prev_point = points[i-1]
                curr_point = points[i]
                
                # Skip if points don't have valid coordinates
                if (not prev_point.get('lat') or not prev_point.get('lon') or 
                    not curr_point.get('lat') or not curr_point.get('lon')):
                    continue
                
                segment_distance = calculate_distance(
                    prev_point['lat'], prev_point['lon'],
                    curr_point['lat'], curr_point['lon']
                )
                total_distance += segment_distance
                
                # Add arrow if we've traveled enough distance
                if total_distance - last_arrow_distance >= interval_meters:
                    bearing = calculate_bearing(
                        prev_point['lat'], prev_point['lon'],
                        curr_point['lat'], curr_point['lon']
                    )
                    
                    arrows.append({
                        'lat': curr_point['lat'],
                        'lon': curr_point['lon'],
                        'bearing': bearing
                    })
                    last_arrow_distance = total_distance
            except Exception as e:
                print(f"Error processing arrow for points {i-1}-{i}: {e}")
                continue
    except Exception as e:
        print(f"Error generating direction arrows: {e}")
    
    return arrows

def detect_route_overlaps(points1, points2, tolerance_meters=50):
    """Detect overlapping segments between two routes."""
    overlaps = []
    
    try:
        # Convert points to LineString
        if len(points1) < 2 or len(points2) < 2:
            return overlaps
        
        # Simple overlap detection - check every 10th point to avoid performance issues
        step = max(1, len(points1) // 50)  # Sample points for performance
        
        for i in range(0, len(points1) - 1, step):
            try:
                p1 = points1[i]
                
                # Skip if point doesn't have valid coordinates
                if not p1.get('lat') or not p1.get('lon'):
                    continue
                
                # Check if this point is close to any point in route 2
                for j in range(0, len(points2), step):
                    try:
                        p2_point = points2[j]
                        
                        # Skip if point doesn't have valid coordinates
                        if not p2_point.get('lat') or not p2_point.get('lon'):
                            continue
                        
                        distance = calculate_distance(
                            p1['lat'], p1['lon'], 
                            p2_point['lat'], p2_point['lon']
                        )
                        
                        if distance <= tolerance_meters:
                            overlaps.append({
                                'route1_point': p1,
                                'route2_point': p2_point,
                                'distance': distance
                            })
                    except Exception as e:
                        print(f"Error checking overlap for route2 point {j}: {e}")
                        continue
            except Exception as e:
                print(f"Error checking overlap for route1 point {i}: {e}")
                continue
    except Exception as e:
        print(f"Error detecting route overlaps: {e}")
    
    return overlaps

def smart_marker_positioning(start_point, end_point, other_points, min_distance=100):
    """Adjust marker positions to avoid overlaps."""
    try:
        # Check if start/end markers are too close to other important points
        adjusted_start = start_point.copy()
        adjusted_end = end_point.copy()
        
        # Skip marker adjustment for now to avoid complexity - just return originals
        # This can be enhanced later if needed
        return adjusted_start, adjusted_end
    except Exception as e:
        print(f"Error in smart marker positioning: {e}")
        # Return original points if there's any error
        return start_point, end_point

def process_gpx_data(points1, points2, file1_path, file2_path):
    """Process GPX data and return structured data for interactive visualization."""
    if not points1 or not points2:
        raise ValueError("Both GPX files must contain valid track points")
    
    try:
        # Extract route data
        route1 = {
            'name': os.path.splitext(os.path.basename(file1_path))[0],
            'points': points1,
            'start': points1[0],
            'end': points1[-1],
            'color': '#2563eb',  # Blue
            'arrows': generate_direction_arrows(points1)
        }
        
        route2 = {
            'name': os.path.splitext(os.path.basename(file2_path))[0],
            'points': points2,
            'start': points2[0],
            'end': points2[-1],
            'color': '#dc2626',  # Red
            'arrows': generate_direction_arrows(points2)
        }
    except Exception as e:
        print(f"Error creating route data: {e}")
        raise ValueError(f"Error processing route data: {str(e)}")
    
    # Adjust marker positions to avoid overlaps
    other_points = [route2['start'], route2['end']]
    route1['start'], route1['end'] = smart_marker_positioning(
        route1['start'], route1['end'], other_points
    )
    
    other_points = [route1['start'], route1['end']]
    route2['start'], route2['end'] = smart_marker_positioning(
        route2['start'], route2['end'], other_points
    )
    
    # Calculate bounds
    all_lats = [p['lat'] for p in points1 + points2]
    all_lons = [p['lon'] for p in points1 + points2]
    
    bounds = {
        'north': max(all_lats),
        'south': min(all_lats),
        'east': max(all_lons),
        'west': min(all_lons)
    }
    
    # Add padding to bounds
    lat_padding = (bounds['north'] - bounds['south']) * 0.1
    lon_padding = (bounds['east'] - bounds['west']) * 0.1
    
    bounds['north'] += lat_padding
    bounds['south'] -= lat_padding
    bounds['east'] += lon_padding
    bounds['west'] -= lon_padding
    
    # Detect overlaps
    overlaps = detect_route_overlaps(points1, points2)
    
    return {
        'route1': route1,
        'route2': route2,
        'bounds': bounds,
        'overlaps': overlaps
    }

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