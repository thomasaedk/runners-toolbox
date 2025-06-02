#!/usr/bin/env python3
import sys
import json
import cv2
import numpy as np
from PIL import Image
import gpxpy
import gpxpy.gpx
from datetime import datetime
import os
from scipy.spatial.distance import cdist
from scipy.interpolate import griddata

def interpolate_coordinates(x, y, src_points, dst_points):
    """Interpolate geographic coordinates from image coordinates using control points."""
    # Use inverse distance weighting for coordinate transformation
    distances = cdist([[x, y]], src_points)[0]
    
    # Avoid division by zero
    distances = np.maximum(distances, 1e-6)
    weights = 1.0 / distances
    weights = weights / np.sum(weights)
    
    # Weighted average of destination coordinates
    lat = np.sum(weights * dst_points[:, 1])
    lng = np.sum(weights * dst_points[:, 0])
    
    return lat, lng

def align_image(image_path, control_points_str):
    """Align the uploaded image using control points."""
    try:
        control_points = json.loads(control_points_str)
        
        # Load the image to get dimensions
        img = cv2.imread(image_path)
        if img is None:
            print(f"Error: Could not load image from {image_path}", file=sys.stderr)
            return False
            
        height, width = img.shape[:2]
        
        # Extract source and destination points
        src_points = []
        dst_points = []
        
        for cp in control_points:
            # Convert relative coordinates to absolute pixel coordinates
            abs_x = cp['imageX'] * width
            abs_y = cp['imageY'] * height
            src_points.append([abs_x, abs_y])
            dst_points.append([cp['mapLng'], cp['mapLat']])
        
        if len(src_points) < 3:
            print("Error: Need at least 3 control points for alignment", file=sys.stderr)
            return False
            
        src_points = np.array(src_points, dtype=np.float32)
        dst_points = np.array(dst_points, dtype=np.float32)
        
        # Control point processing completed successfully
        
        # Store the control points and geographic bounds for coordinate transformation
        control_data = {
            'control_points': control_points,
            'image_width': width,
            'image_height': height,
            'src_points': src_points.tolist(),
            'dst_points': dst_points.tolist()
        }
        
        # Save the control data for later use
        control_path = image_path.replace('.', '_control.') + '.json'
        with open(control_path, 'w') as f:
            json.dump(control_data, f)
        
        print("Image alignment completed successfully")
        return True
        
    except Exception as e:
        print(f"Error during image alignment: {str(e)}", file=sys.stderr)
        return False

def extract_route(image_path, route_points_str):
    """Extract route from aligned image and generate GPX file."""
    try:
        route_points = json.loads(route_points_str) if route_points_str != '[]' else []
        
        # Load control data
        control_path = image_path.replace('.', '_control.') + '.json'
        if not os.path.exists(control_path):
            print("Error: No alignment data found. Please align the image first.", file=sys.stderr)
            return False
            
        with open(control_path, 'r') as f:
            control_data = json.load(f)
            
        src_points = np.array(control_data['src_points'], dtype=np.float32)
        dst_points = np.array(control_data['dst_points'], dtype=np.float32)
        
        # Create GPX object
        gpx = gpxpy.gpx.GPX()
        gpx_track = gpxpy.gpx.GPXTrack()
        gpx.tracks.append(gpx_track)
        gpx_segment = gpxpy.gpx.GPXTrackSegment()
        gpx_track.segments.append(gpx_segment)
        
        # If route points are provided, use them directly
        if route_points:
            for point in route_points:
                # Convert relative coordinates to absolute pixel coordinates
                abs_x = point['x'] * control_data['image_width']
                abs_y = point['y'] * control_data['image_height']
                
                # Transform image coordinates to geographic coordinates using interpolation
                lat, lng = interpolate_coordinates(abs_x, abs_y, src_points, dst_points)
                gpx_segment.points.append(gpxpy.gpx.GPXTrackPoint(lat, lng))
        else:
            # Auto-extract route using edge detection and path finding
            img = cv2.imread(image_path)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Apply edge detection
            edges = cv2.Canny(gray, 50, 150)
            
            # Find contours
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Find the longest contour (likely the route)
            if contours:
                longest_contour = max(contours, key=cv2.contourArea)
                
                # Simplify the contour
                epsilon = 0.01 * cv2.arcLength(longest_contour, False)
                simplified_contour = cv2.approxPolyDP(longest_contour, epsilon, False)
                
                # Convert contour points to geographic coordinates
                for point in simplified_contour:
                    x, y = point[0]
                    lat, lng = interpolate_coordinates(x, y, src_points, dst_points)
                    gpx_segment.points.append(gpxpy.gpx.GPXTrackPoint(lat, lng))
        
        # Save GPX file - extract original filename from the route_image_ prefix
        base_filename = os.path.basename(image_path)
        if base_filename.startswith('route_image_'):
            original_filename = base_filename[12:]  # Remove 'route_image_' prefix
        else:
            original_filename = base_filename
        gpx_filename = f"extracted_route_{original_filename}.gpx"
        gpx_path = os.path.join(os.path.dirname(image_path), gpx_filename)
        
        with open(gpx_path, 'w') as f:
            f.write(gpx.to_xml())
        
        print(f"GPX file generated: {gpx_path}")
        return True
        
    except Exception as e:
        print(f"Error during route extraction: {str(e)}", file=sys.stderr)
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 route_extractor.py <command> <image_path> [data]", file=sys.stderr)
        sys.exit(1)
    
    command = sys.argv[1]
    image_path = sys.argv[2]
    
    if command == "align":
        if len(sys.argv) < 4:
            print("Usage: python3 route_extractor.py align <image_path> <control_points_json>", file=sys.stderr)
            sys.exit(1)
        control_points = sys.argv[3]
        success = align_image(image_path, control_points)
        sys.exit(0 if success else 1)
        
    elif command == "extract":
        route_points = sys.argv[3] if len(sys.argv) > 3 else "[]"
        success = extract_route(image_path, route_points)
        sys.exit(0 if success else 1)
        
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()