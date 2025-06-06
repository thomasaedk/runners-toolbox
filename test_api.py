#!/usr/bin/env python3
import requests
import sys
import json
import os

def test_backend():
    base_url = "http://localhost:5000"
    
    # Test health endpoint
    try:
        print("Testing health endpoint...")
        response = requests.get(f"{base_url}/api/health", timeout=5)
        print(f"Health check status: {response.status_code}")
        if response.status_code == 200:
            print(f"Health response: {response.json()}")
        else:
            print(f"Health check failed: {response.text}")
            return False
    except Exception as e:
        print(f"Could not connect to backend: {e}")
        return False
    
    print("Backend is accessible!")
    return True

def test_gpx_processing():
    print("\nTesting GPX processing...")
    try:
        from backend.gpx_processor import parse_gpx_file, process_gpx_data
        
        # Create a simple test GPX file
        test_gpx = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="55.6761" lon="12.5683"><ele>10</ele></trkpt>
      <trkpt lat="55.6762" lon="12.5684"><ele>10</ele></trkpt>
      <trkpt lat="55.6763" lon="12.5685"><ele>10</ele></trkpt>
      <trkpt lat="55.6764" lon="12.5686"><ele>10</ele></trkpt>
    </trkseg>
  </trk>
</gpx>"""
        
        # Write test files
        with open('/tmp/test1.gpx', 'w') as f:
            f.write(test_gpx)
        
        test_gpx2 = test_gpx.replace('55.676', '55.677')  # Slightly different route
        with open('/tmp/test2.gpx', 'w') as f:
            f.write(test_gpx2)
        
        # Test parsing
        points1 = parse_gpx_file('/tmp/test1.gpx')
        points2 = parse_gpx_file('/tmp/test2.gpx')
        
        print(f"Parsed {len(points1)} points from file 1")
        print(f"Parsed {len(points2)} points from file 2")
        
        if points1 and points2:
            result = process_gpx_data(points1, points2, '/tmp/test1.gpx', '/tmp/test2.gpx')
            print("GPX processing successful!")
            print(f"Route 1 name: {result['route1']['name']}")
            print(f"Route 2 name: {result['route2']['name']}")
            print(f"Bounds: {result['bounds']}")
            return True
        else:
            print("No points parsed from GPX files")
            return False
            
    except Exception as e:
        print(f"GPX processing failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=== Backend API Test ===")
    
    # Test backend connectivity
    backend_ok = test_backend()
    
    # Test GPX processing
    gpx_ok = test_gpx_processing()
    
    if backend_ok and gpx_ok:
        print("\n✅ All tests passed!")
    else:
        print("\n❌ Some tests failed!")
        sys.exit(1)