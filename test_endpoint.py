#!/usr/bin/env python3
import requests
import io

# Create test GPX content
test_gpx1 = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test Route 1</name>
    <trkseg>
      <trkpt lat="55.6761" lon="12.5683"><ele>10</ele></trkpt>
      <trkpt lat="55.6762" lon="12.5684"><ele>10</ele></trkpt>
      <trkpt lat="55.6763" lon="12.5685"><ele>10</ele></trkpt>
      <trkpt lat="55.6764" lon="12.5686"><ele>10</ele></trkpt>
      <trkpt lat="55.6765" lon="12.5687"><ele>10</ele></trkpt>
    </trkseg>
  </trk>
</gpx>"""

test_gpx2 = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test Route 2</name>
    <trkseg>
      <trkpt lat="55.6771" lon="12.5683"><ele>10</ele></trkpt>
      <trkpt lat="55.6772" lon="12.5684"><ele>10</ele></trkpt>
      <trkpt lat="55.6773" lon="12.5685"><ele>10</ele></trkpt>
      <trkpt lat="55.6774" lon="12.5686"><ele>10</ele></trkpt>
      <trkpt lat="55.6775" lon="12.5687"><ele>10</ele></trkpt>
    </trkseg>
  </trk>
</gpx>"""

# Test the new API endpoint
url = "http://localhost:5000/api/compare-gpx-data"

files = {
    'file1': ('test1.gpx', io.StringIO(test_gpx1), 'application/gpx+xml'),
    'file2': ('test2.gpx', io.StringIO(test_gpx2), 'application/gpx+xml')
}

try:
    print("Testing /api/compare-gpx-data endpoint...")
    response = requests.post(url, files=files)
    print(f"Status code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ API call successful!")
        print(f"Route 1: {data['route1']['name']}")
        print(f"Route 2: {data['route2']['name']}")
        print(f"Route 1 points: {len(data['route1']['points'])}")
        print(f"Route 2 points: {len(data['route2']['points'])}")
        print(f"Route 1 arrows: {len(data['route1']['arrows'])}")
        print(f"Route 2 arrows: {len(data['route2']['arrows'])}")
        print(f"Bounds: {data['bounds']}")
        print(f"Overlaps: {len(data['overlaps'])}")
    else:
        print(f"❌ API call failed: {response.text}")
        
except Exception as e:
    print(f"❌ Error: {e}")