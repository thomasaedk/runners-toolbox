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
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from multiprocessing import cpu_count
from sklearn.neighbors import BallTree
import hashlib
import pickle

# Create cache directory
CACHE_DIR = os.path.join(os.path.dirname(__file__), 'cache')
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def generate_cache_key(points1, points2, interpolation_distance, difference_threshold):
    """Generate a unique cache key for the given parameters."""
    # Create a string representation of the key parameters
    key_data = {
        'points1_hash': hashlib.md5(str([(p['lat'], p['lon']) for p in points1[:100]]).encode()).hexdigest(),
        'points2_hash': hashlib.md5(str([(p['lat'], p['lon']) for p in points2[:100]]).encode()).hexdigest(),
        'interpolation_distance': interpolation_distance,
        'difference_threshold': difference_threshold,
        'points1_len': len(points1),
        'points2_len': len(points2)
    }
    
    # Generate hash of the combined parameters
    cache_key = hashlib.md5(str(key_data).encode()).hexdigest()
    return cache_key

def get_cached_result(cache_key):
    """Retrieve cached result if it exists."""
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.pkl")
    try:
        if os.path.exists(cache_file):
            # Check if cache is less than 24 hours old
            cache_age = time.time() - os.path.getmtime(cache_file)
            if cache_age < 24 * 3600:  # 24 hours
                with open(cache_file, 'rb') as f:
                    return pickle.load(f)
            else:
                # Remove old cache file
                os.remove(cache_file)
    except Exception as e:
        print(f"Error reading cache: {e}")
    
    return None

def save_cached_result(cache_key, result):
    """Save result to cache."""
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.pkl")
    try:
        with open(cache_file, 'wb') as f:
            pickle.dump(result, f)
    except Exception as e:
        print(f"Error saving cache: {e}")

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

def interpolate_track_points(points, target_distance_meters=10):
    """Interpolate track points to have a consistent distance between points."""
    if len(points) < 2:
        return points
    
    interpolated_points = []
    current_distance = 0
    
    # Add first point
    interpolated_points.append(points[0])
    
    for i in range(1, len(points)):
        prev_point = points[i-1]
        curr_point = points[i]
        
        # Calculate distance between consecutive points
        segment_distance = calculate_distance(
            prev_point['lat'], prev_point['lon'],
            curr_point['lat'], curr_point['lon']
        )
        
        if segment_distance == 0:
            continue
            
        # Calculate how many interpolated points we need in this segment
        num_points = max(1, int(segment_distance / target_distance_meters))
        
        # Interpolate points along the segment
        for j in range(1, num_points + 1):
            ratio = j / num_points
            
            # Linear interpolation of coordinates
            new_lat = prev_point['lat'] + (curr_point['lat'] - prev_point['lat']) * ratio
            new_lon = prev_point['lon'] + (curr_point['lon'] - prev_point['lon']) * ratio
            new_ele = prev_point['ele'] + (curr_point['ele'] - prev_point['ele']) * ratio
            
            interpolated_points.append({
                'lat': new_lat,
                'lon': new_lon,
                'ele': new_ele,
                'time': None  # Interpolated points don't have original timestamps
            })
    
    return interpolated_points

def analyze_route_complexity(points, sample_size=50):
    """Analyze route complexity to determine optimal sampling strategy."""
    if len(points) < 3:
        return 1.0  # Simple route
    
    # Sample points to analyze curvature
    step = max(1, len(points) // sample_size)
    sample_points = points[::step]
    
    total_curvature = 0
    for i in range(1, len(sample_points) - 1):
        prev_point = sample_points[i-1]
        curr_point = sample_points[i]
        next_point = sample_points[i+1]
        
        # Calculate bearings
        bearing1 = calculate_bearing(prev_point['lat'], prev_point['lon'], 
                                   curr_point['lat'], curr_point['lon'])
        bearing2 = calculate_bearing(curr_point['lat'], curr_point['lon'],
                                   next_point['lat'], next_point['lon'])
        
        # Calculate angular difference (curvature)
        angle_diff = abs(bearing2 - bearing1)
        if angle_diff > 180:
            angle_diff = 360 - angle_diff
        
        total_curvature += angle_diff
    
    # Normalize curvature (higher = more complex)
    avg_curvature = total_curvature / max(1, len(sample_points) - 2)
    complexity = min(avg_curvature / 45.0, 2.0)  # Scale 0-2
    
    return complexity

def calculate_route_differences_with_spatial_index(points1, points2, threshold_meters=30):
    """Calculate differences between two routes using adaptive spatial indexing for optimal accuracy."""
    if len(points1) < 2 or len(points2) < 2:
        return []
    
    # Analyze route complexity to determine sampling strategy
    complexity1 = analyze_route_complexity(points1)
    complexity2 = analyze_route_complexity(points2)
    max_complexity = max(complexity1, complexity2)
    
    # Adaptive sampling based on complexity and size
    # For complex routes, use less aggressive sampling to maintain accuracy
    base_sample_rate = 2 if len(points1) > 2000 else 1
    
    # Adjust sampling based on complexity
    if max_complexity > 1.5:  # Very complex route
        sample_rate = 1  # No sampling for complex routes
        sample_rate2 = 1
    elif max_complexity > 1.0:  # Moderately complex
        sample_rate = max(1, base_sample_rate // 2)
        sample_rate2 = max(1, base_sample_rate // 2)
    else:  # Simple route
        sample_rate = base_sample_rate
        sample_rate2 = base_sample_rate
    
    # Always use full resolution for small datasets or when high accuracy is needed
    if len(points1) < 1000:  # Increased from 500 to 1000 for better accuracy
        sample_rate = 1
    if len(points2) < 1000:  # Increased from 500 to 1000 for better accuracy
        sample_rate2 = 1
    
    # For threshold < 30m, use higher accuracy
    if threshold_meters < 30:
        sample_rate = max(1, sample_rate // 2)  # Use twice as many points
        print(f"High accuracy mode: threshold < 30m, using sample rate {sample_rate}")
    
    print(f"Route complexity: {complexity1:.2f}, {complexity2:.2f} -> Sample rates: {sample_rate}, {sample_rate2}")
    
    # Sample points for performance while maintaining accuracy
    sampled_points1 = [points1[i] for i in range(0, len(points1), sample_rate)]
    
    # For route2, build spatial index with ALL points for maximum accuracy
    # Convert ALL points2 to numpy arrays for BallTree (lat, lon in radians)
    points2_rad = np.array([[math.radians(p['lat']), math.radians(p['lon'])] for p in points2])
    
    # Build spatial index using BallTree with haversine metric on ALL route2 points
    tree = BallTree(points2_rad, metric='haversine')
    
    differences = []
    
    for idx, point1 in enumerate(sampled_points1):
        # Query the spatial index for the nearest neighbor from ALL route2 points
        point1_rad = np.array([[math.radians(point1['lat']), math.radians(point1['lon'])]])
        
        # Find closest point using spatial index (searches ALL route2 points)
        distances, indices = tree.query(point1_rad, k=1)
        
        # Convert distance from radians to meters (Earth's radius = 6371000m)
        min_distance = distances[0][0] * 6371000
        closest_idx = indices[0][0]
        closest_point = points2[closest_idx]  # Get from original points2 array
        
        differences.append({
            'route1_point_idx': int(idx * sample_rate),  # Original index
            'route1_point': point1,
            'closest_route2_point': closest_point,
            'closest_route2_idx': int(closest_idx),  # Direct index in points2
            'distance': float(min_distance),
            'exceeds_threshold': bool(min_distance > threshold_meters)
        })
    
    return differences

def calculate_route_differences_parallel(points1, points2, threshold_meters=30):
    """Calculate differences between two routes using parallel processing with smart sampling."""
    # Use spatial indexing for better performance when available
    try:
        return calculate_route_differences_with_spatial_index(points1, points2, threshold_meters)
    except Exception as e:
        print(f"Spatial indexing failed, falling back to parallel processing: {e}")
        # Fallback to original method if spatial indexing fails
        return calculate_route_differences_parallel_fallback(points1, points2, threshold_meters)

def calculate_route_differences_parallel_fallback(points1, points2, threshold_meters=30):
    """Fallback method using parallel processing with smart sampling."""
    if len(points1) < 2 or len(points2) < 2:
        return []
    
    # Smart sampling: use every 3rd point for large datasets to improve performance
    sample_rate = 3 if len(points1) > 1000 else 1
    sample_rate2 = 3 if len(points2) > 1000 else 1
    
    # Use ThreadPoolExecutor for I/O bound tasks (distance calculations)
    max_workers = min(12, cpu_count())  # Reduced from 16 to 12 for better memory usage
    
    def find_closest_point_distance(point1_data):
        idx, point1 = point1_data
        min_distance = float('inf')
        closest_point = None
        closest_idx = None
        
        # Sample points2 for performance - check every sample_rate2 point
        for j in range(0, len(points2), sample_rate2):
            point2 = points2[j]
            distance = calculate_distance(
                point1['lat'], point1['lon'],
                point2['lat'], point2['lon']
            )
            if distance < min_distance:
                min_distance = distance
                closest_point = point2
                closest_idx = j
                
            # Early termination: if we find a very close point, no need to check further
            if distance < threshold_meters * 0.1:  # 10% of threshold
                break
        
        return {
            'route1_point_idx': idx,
            'route1_point': point1,
            'closest_route2_point': closest_point,
            'closest_route2_idx': closest_idx,
            'distance': min_distance,
            'exceeds_threshold': min_distance > threshold_meters
        }
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Sample points1 for performance
        sampled_points1 = [(i, points1[i]) for i in range(0, len(points1), sample_rate)]
        
        differences = list(executor.map(find_closest_point_distance, sampled_points1))
    
    return differences

def extend_point_along_route(point, next_point, distance_meters):
    """Extend a point along the route direction by a given distance."""
    if not next_point:
        return point
    
    # Calculate bearing from point to next_point
    bearing = calculate_bearing(point['lat'], point['lon'], next_point['lat'], next_point['lon'])
    
    # Calculate new position
    lat_rad = math.radians(point['lat'])
    lon_rad = math.radians(point['lon'])
    bearing_rad = math.radians(bearing)
    
    # Earth's radius in meters
    R = 6371000
    
    # Calculate new latitude
    new_lat_rad = math.asin(
        math.sin(lat_rad) * math.cos(distance_meters / R) +
        math.cos(lat_rad) * math.sin(distance_meters / R) * math.cos(bearing_rad)
    )
    
    # Calculate new longitude
    new_lon_rad = lon_rad + math.atan2(
        math.sin(bearing_rad) * math.sin(distance_meters / R) * math.cos(lat_rad),
        math.cos(distance_meters / R) - math.sin(lat_rad) * math.sin(new_lat_rad)
    )
    
    return {
        'lat': math.degrees(new_lat_rad),
        'lon': math.degrees(new_lon_rad),
        'ele': point['ele'],
        'time': None
    }

def create_route_segments_by_difference(points, differences, threshold_meters=50, route_num=1):
    """Create route segments based on difference analysis with improved accuracy."""
    if not points or not differences:
        return []
    
    # Create a map of point indices to difference status
    point_difference_map = {}
    
    if route_num == 1:
        # For route 1, use the difference data directly and interpolate between sampled points
        for diff in differences:
            idx = diff['route1_point_idx']
            point_difference_map[idx] = diff['exceeds_threshold']
        
        # Interpolate difference status for points between sampled points
        sorted_indices = sorted(point_difference_map.keys())
        for i in range(len(points)):
            if i not in point_difference_map:
                # Find nearest sampled points
                prev_idx = None
                next_idx = None
                
                for idx in sorted_indices:
                    if idx < i:
                        prev_idx = idx
                    elif idx > i and next_idx is None:
                        next_idx = idx
                        break
                
                # Improved interpolation: check if we're in a transition zone
                if prev_idx is not None and next_idx is not None:
                    prev_status = point_difference_map[prev_idx]
                    next_status = point_difference_map[next_idx]
                    
                    if prev_status == next_status:
                        # Same status on both sides, use that status
                        point_difference_map[i] = prev_status
                    else:
                        # Transition zone - use more conservative approach
                        # For transition zones, calculate actual distance to be more precise
                        curr_point = points[i]
                        try:
                            # Use spatial search to get accurate classification
                            route1_points = [diff['route1_point'] for diff in differences]
                            if route1_points:
                                min_dist = float('inf')
                                for rp in route1_points:
                                    dist = calculate_distance(curr_point['lat'], curr_point['lon'], 
                                                            rp['lat'], rp['lon'])
                                    if dist < min_dist:
                                        min_dist = dist
                                point_difference_map[i] = min_dist > threshold_meters
                            else:
                                # Fallback: use closer point
                                if abs(i - prev_idx) <= abs(i - next_idx):
                                    point_difference_map[i] = prev_status
                                else:
                                    point_difference_map[i] = next_status
                        except:
                            # Fallback to distance-based decision
                            if abs(i - prev_idx) <= abs(i - next_idx):
                                point_difference_map[i] = prev_status
                            else:
                                point_difference_map[i] = next_status
                elif prev_idx is not None:
                    point_difference_map[i] = point_difference_map[prev_idx]
                elif next_idx is not None:
                    point_difference_map[i] = point_difference_map[next_idx]
                else:
                    point_difference_map[i] = False  # Default to similar
    else:
        # For route 2, use spatial indexing for better accuracy
        try:
            # Build spatial index for route 1 points
            route1_points = [diff['route1_point'] for diff in differences]
            route1_rad = np.array([[math.radians(p['lat']), math.radians(p['lon'])] for p in route1_points])
            tree = BallTree(route1_rad, metric='haversine')
            
            for i, point2 in enumerate(points):
                # Find closest route1 point using spatial index
                point2_rad = np.array([[math.radians(point2['lat']), math.radians(point2['lon'])]])
                distances, indices = tree.query(point2_rad, k=1)
                min_distance = distances[0][0] * 6371000  # Convert to meters
                
                point_difference_map[i] = min_distance > threshold_meters
        except:
            # Fallback to original method if spatial indexing fails
            for i, point2 in enumerate(points):
                min_distance = float('inf')
                for diff in differences:
                    route1_point = diff['route1_point']
                    distance = calculate_distance(
                        point2['lat'], point2['lon'],
                        route1_point['lat'], route1_point['lon']
                    )
                    if distance < min_distance:
                        min_distance = distance
                
                point_difference_map[i] = min_distance > threshold_meters
    
    segments = []
    current_segment = []
    current_is_different = None
    
    for i, point in enumerate(points):
        is_different = point_difference_map.get(i, False)  # Default to common if no data
        
        # If this is the first point or the difference status changed
        if current_is_different is None or current_is_different != is_different:
            # Save the previous segment if it exists
            if current_segment:
                segments.append({
                    'points': current_segment,
                    'is_different': current_is_different,
                    'start_idx': current_segment[0]['original_idx'],
                    'end_idx': current_segment[-1]['original_idx']
                })
            
            # Start a new segment
            current_segment = []
            current_is_different = is_different
        
        # Add point to current segment with original index
        point_with_idx = point.copy()
        point_with_idx['original_idx'] = i
        current_segment.append(point_with_idx)
    
    # Add the final segment
    if current_segment:
        segments.append({
            'points': current_segment,
            'is_different': current_is_different,
            'start_idx': current_segment[0]['original_idx'],
            'end_idx': current_segment[-1]['original_idx']
        })
    
    # Return segments without any extensions
    return segments

def _interpolate_with_distance(args):
    """Helper function for parallel interpolation that can be pickled."""
    points, target_distance = args
    return interpolate_track_points(points, target_distance)

def process_interpolation_parallel(points_list, target_distance):
    """Process interpolation for multiple point sets in parallel."""
    max_workers = min(16, cpu_count())
    
    # Prepare arguments for the helper function
    args_list = [(points, target_distance) for points in points_list]
    
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(_interpolate_with_distance, args_list))
    
    return results

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

def process_gpx_data(points1, points2, file1_path, file2_path, interpolation_distance=10, difference_threshold=40):
    """Process GPX data and return structured data for interactive visualization with caching."""
    if not points1 or not points2:
        raise ValueError("Both GPX files must contain valid track points")
    
    # Check cache first
    cache_key = generate_cache_key(points1, points2, interpolation_distance, difference_threshold)
    cached_result = get_cached_result(cache_key)
    
    if cached_result:
        print("[CACHE HIT] Using cached result for faster processing...")
        return cached_result
    
    print("[CACHE MISS] Processing GPX data...")
    
    try:
        print(f"[Step 1/5] Original points - Route1: {len(points1)}, Route2: {len(points2)}")
        
        # Interpolate points in parallel
        print(f"[Step 2/5] Interpolating with {interpolation_distance}m spacing...")
        interpolated_results = process_interpolation_parallel([points1, points2], interpolation_distance)
        interpolated_points1, interpolated_points2 = interpolated_results
        
        print(f"[Step 2/5] Interpolated points - Route1: {len(interpolated_points1)}, Route2: {len(interpolated_points2)}")
        
        # Calculate differences using parallel processing
        print(f"[Step 3/5] Calculating differences with {difference_threshold}m threshold...")
        print(f"[Step 3/5] Using adaptive accuracy-optimized algorithm...")
        differences = calculate_route_differences_parallel(interpolated_points1, interpolated_points2, difference_threshold)
        
        # Count significant differences
        significant_differences = [d for d in differences if d['exceeds_threshold']]
        print(f"[Step 3/5] Found {len(significant_differences)} significant differences out of {len(differences)} total comparisons")
        
        # Create route segments based on differences
        print("[Step 4/5] Creating route segments based on differences...")
        route1_segments = create_route_segments_by_difference(interpolated_points1, differences, difference_threshold, route_num=1)
        route2_segments = create_route_segments_by_difference(interpolated_points2, differences, difference_threshold, route_num=2)
        print(f"[Step 4/5] Route 1 segments: {len(route1_segments)}, Route 2 segments: {len(route2_segments)}")
        
        # Debug segment statistics
        route1_diff_segments = [s for s in route1_segments if s['is_different']]
        route2_diff_segments = [s for s in route2_segments if s['is_different']]
        print(f"[Step 4/5] Difference segments - Route1: {len(route1_diff_segments)}, Route2: {len(route2_diff_segments)}")
        
        if route1_diff_segments:
            total_diff_points = sum(len(s['points']) for s in route1_diff_segments)
            print(f"[Step 4/5] Total difference points in Route1: {total_diff_points}")
        if route2_diff_segments:
            total_diff_points = sum(len(s['points']) for s in route2_diff_segments)
            print(f"[Step 4/5] Total difference points in Route2: {total_diff_points}")
        
        # Extract route data using interpolated points
        print("[Step 5/5] Generating route visualization data...")
        route1 = {
            'name': os.path.splitext(os.path.basename(file1_path))[0],
            'points': interpolated_points1,
            'original_points': points1,
            'start': interpolated_points1[0],
            'end': interpolated_points1[-1],
            'color': '#8b5cf6',  # Purple
            'common_color': '#fbbf24',  # Bright Yellow for common segments
            'arrows': generate_direction_arrows(interpolated_points1),
            'segments': route1_segments
        }
        
        route2 = {
            'name': os.path.splitext(os.path.basename(file2_path))[0],
            'points': interpolated_points2,
            'original_points': points2,
            'start': interpolated_points2[0],
            'end': interpolated_points2[-1],
            'color': '#f97316',  # Orange
            'common_color': '#fbbf24',  # Bright Yellow for common segments
            'arrows': generate_direction_arrows(interpolated_points2),
            'segments': route2_segments
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
    
    # Calculate bounds using interpolated points
    all_lats = [p['lat'] for p in interpolated_points1 + interpolated_points2]
    all_lons = [p['lon'] for p in interpolated_points1 + interpolated_points2]
    
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
    
    # Use the calculated differences instead of simple overlaps
    overlaps = significant_differences
    
    # Ensure all values are JSON serializable
    def make_serializable(obj):
        """Convert numpy types and other non-serializable objects to Python native types."""
        if hasattr(obj, 'dtype'):  # numpy arrays and scalars
            if obj.dtype.kind in ('i', 'u'):  # integer types
                return int(obj) if obj.ndim == 0 else obj.tolist()
            elif obj.dtype.kind == 'f':  # floating point types
                return float(obj) if obj.ndim == 0 else obj.tolist()
            elif obj.dtype.kind == 'b':  # boolean types
                return bool(obj) if obj.ndim == 0 else obj.tolist()
            else:
                return obj.tolist() if obj.ndim > 0 else str(obj)
        elif isinstance(obj, dict):
            return {k: make_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [make_serializable(item) for item in obj]
        elif isinstance(obj, (np.integer, int)):
            return int(obj)
        elif isinstance(obj, (np.floating, float)):
            return float(obj)
        elif isinstance(obj, np.bool_):
            return bool(obj)
        else:
            return obj
    
    result = {
        'route1': make_serializable(route1),
        'route2': make_serializable(route2),
        'bounds': make_serializable(bounds),
        'overlaps': make_serializable(overlaps),
        'differences': make_serializable(differences),
        'significant_differences': make_serializable(significant_differences),
        'interpolation_distance': float(interpolation_distance),
        'difference_threshold': float(difference_threshold),
        'statistics': {
            'total_comparisons': len(differences),
            'significant_differences_count': len(significant_differences),
            'similarity_percentage': round((1 - len(significant_differences) / len(differences)) * 100, 2) if differences else 0
        }
    }
    
    # Save result to cache for future use
    save_cached_result(cache_key, result)
    print("[CACHE SAVE] Result saved to cache for faster future processing")
    
    return result

def create_comparison_plot(points1, points2, output_path, file1_path, file2_path, map_type='satellite', difference_threshold=30):
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
    
    # Create the plot with optimized size for web display (smaller for better performance)
    fig, ax = plt.subplots(figsize=(12, 8))

    # Plot the routes as simple red and blue lines
    file1_basename = os.path.basename(file1_path)
    file2_basename = os.path.basename(file2_path)
    gdf1_mercator.plot(ax=ax, color='red', linewidth=3, alpha=0.9, label=os.path.basename(os.path.splitext(file1_basename)[0]))
    gdf2_mercator.plot(ax=ax, color='blue', linewidth=3, alpha=0.9, label=os.path.basename(os.path.splitext(file2_basename)[0]))
    
    # Calculate differences to identify different segments
    interpolated_points1 = interpolate_track_points(points1, 10)
    interpolated_points2 = interpolate_track_points(points2, 10)
    differences = calculate_route_differences_parallel(interpolated_points1, interpolated_points2, difference_threshold)
    
    # Create segments for both routes
    route1_segments = create_route_segments_by_difference(interpolated_points1, differences, difference_threshold, route_num=1)
    route2_segments = create_route_segments_by_difference(interpolated_points2, differences, difference_threshold, route_num=2)
    
    # Add rounded squares around DIFFERENCE segments (not common segments)
    from matplotlib.patches import FancyBboxPatch
    from pyproj import Transformer
    transformer = Transformer.from_crs('EPSG:4326', 'EPSG:3857', always_xy=True)
    
    # Process different segments for route 1
    for segment in route1_segments:
        if segment['is_different']:  # DIFFERENT segment (not common)
            segment_points = segment['points']
            if len(segment_points) >= 2:
                # Convert segment points to mercator
                segment_lons = [p['lon'] for p in segment_points]
                segment_lats = [p['lat'] for p in segment_points]
                
                # Calculate bounding box for the segment
                min_lon, max_lon = min(segment_lons), max(segment_lons)
                min_lat, max_lat = min(segment_lats), max(segment_lats)
                
                # Transform to mercator coordinates
                min_x, min_y = transformer.transform(min_lon, min_lat)
                max_x, max_y = transformer.transform(max_lon, max_lat)
                
                # Add padding around the segment
                padding = max(max_x - min_x, max_y - min_y) * 0.3
                if padding < 100:  # Minimum padding in meters
                    padding = 100
                
                # Create rounded rectangle around DIFFERENCE
                bbox = FancyBboxPatch(
                    (min_x - padding, min_y - padding),
                    (max_x - min_x + 2*padding),
                    (max_y - min_y + 2*padding),
                    boxstyle="round,pad=0.1",
                    facecolor='none',
                    edgecolor='orange',
                    alpha=0.8,
                    linewidth=3,
                    linestyle='--'
                )
                ax.add_patch(bbox)
    
    # Process different segments for route 2
    for segment in route2_segments:
        if segment['is_different']:  # DIFFERENT segment (not common)
            segment_points = segment['points']
            if len(segment_points) >= 2:
                # Convert segment points to mercator
                segment_lons = [p['lon'] for p in segment_points]
                segment_lats = [p['lat'] for p in segment_points]
                
                # Calculate bounding box for the segment
                min_lon, max_lon = min(segment_lons), max(segment_lons)
                min_lat, max_lat = min(segment_lats), max(segment_lats)
                
                # Transform to mercator coordinates
                min_x, min_y = transformer.transform(min_lon, min_lat)
                max_x, max_y = transformer.transform(max_lon, max_lat)
                
                # Add padding around the segment
                padding = max(max_x - min_x, max_y - min_y) * 0.3
                if padding < 100:  # Minimum padding in meters
                    padding = 100
                
                # Create rounded rectangle around DIFFERENCE
                bbox = FancyBboxPatch(
                    (min_x - padding, min_y - padding),
                    (max_x - min_x + 2*padding),
                    (max_y - min_y + 2*padding),
                    boxstyle="round,pad=0.1",
                    facecolor='none',
                    edgecolor='purple',
                    alpha=0.8,
                    linewidth=3,
                    linestyle='--'
                )
                ax.add_patch(bbox)
    
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
    plt.savefig(output_path, dpi=120, bbox_inches='tight', facecolor='white', format='jpeg', pil_kwargs={'quality': 85, 'optimize': True})
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