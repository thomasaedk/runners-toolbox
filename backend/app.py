from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import tempfile
import subprocess
from werkzeug.utils import secure_filename
from gpx_processor import parse_gpx_file, process_gpx_data

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'gpx'}

# Create uploads directory with absolute path
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
    print(f"Created uploads directory: {os.path.abspath(UPLOAD_FOLDER)}")
else:
    print(f"Uploads directory exists: {os.path.abspath(UPLOAD_FOLDER)}")

# Also create backend/uploads for the Docker container
backend_upload_folder = '/app/backend/uploads'
try:
    if not os.path.exists(backend_upload_folder):
        os.makedirs(backend_upload_folder)
        print(f"Created backend uploads directory: {backend_upload_folder}")
    else:
        print(f"Backend uploads directory exists: {backend_upload_folder}")
    
    # Use the backend uploads folder in Docker
    if os.path.exists('/app/backend'):
        UPLOAD_FOLDER = backend_upload_folder
except PermissionError:
    print("Running in development mode, using local uploads folder")
    # Keep using the local uploads folder

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/compare-gpx-data', methods=['POST'])
def compare_gpx_data():
    """New endpoint that returns GPX data for interactive visualization."""
    print("=== GPX Compare Data endpoint called ===")
    print(f"Request files: {list(request.files.keys())}")
    print(f"Request form: {dict(request.form)}")
    
    if 'file1' not in request.files or 'file2' not in request.files:
        print("ERROR: Missing files in request")
        return jsonify({'error': 'Both files are required'}), 400
    
    file1 = request.files['file1']
    file2 = request.files['file2']
    
    print(f"File1: {file1.filename}, File2: {file2.filename}")
    
    if file1.filename == '' or file2.filename == '':
        print("ERROR: Empty filenames")
        return jsonify({'error': 'No files selected'}), 400
    
    if not (allowed_file(file1.filename) and allowed_file(file2.filename)):
        print("ERROR: Invalid file types")
        return jsonify({'error': 'Only .gpx files are allowed'}), 400
    
    try:
        print("Starting GPX data processing...")
        # Save uploaded files temporarily
        filename1 = secure_filename(file1.filename)
        filename2 = secure_filename(file2.filename)
        
        filepath1 = os.path.join(UPLOAD_FOLDER, filename1)
        filepath2 = os.path.join(UPLOAD_FOLDER, filename2)
        
        print(f"Saving files to: {filepath1}, {filepath2}")
        file1.save(filepath1)
        file2.save(filepath2)
        print("Files saved successfully")
        
        # Parse GPX files
        try:
            points1 = parse_gpx_file(filepath1)
            points2 = parse_gpx_file(filepath2)
        except Exception as e:
            print(f"Error parsing GPX files: {e}")
            return jsonify({'error': f'Error parsing GPX files: {str(e)}'}), 400
        
        print(f"Points found - File1: {len(points1)}, File2: {len(points2)}")
        
        if not points1:
            return jsonify({'error': 'No track points found in first GPX file'}), 400
        
        if not points2:
            return jsonify({'error': 'No track points found in second GPX file'}), 400
        
        # Process data for interactive visualization
        try:
            result_data = process_gpx_data(points1, points2, filepath1, filepath2)
        except Exception as e:
            print(f"Error processing GPX data: {e}")
            return jsonify({'error': f'Error processing GPX data: {str(e)}'}), 500
        
        print("GPX data processing completed successfully")
        return jsonify(result_data)
            
    except Exception as e:
        print(f"EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up uploaded files
        try:
            if 'filepath1' in locals() and os.path.exists(filepath1):
                os.remove(filepath1)
            if 'filepath2' in locals() and os.path.exists(filepath2):
                os.remove(filepath2)
        except Exception as e:
            print(f"Cleanup error: {e}")

@app.route('/api/compare-gpx', methods=['POST'])
def compare_gpx():
    print("=== GPX Compare endpoint called ===")
    print(f"Request files: {list(request.files.keys())}")
    print(f"Request form: {dict(request.form)}")
    
    # Get map type from form data (default to satellite)
    map_type = request.form.get('mapType', 'satellite')
    print(f"Map type: {map_type}")
    
    if 'file1' not in request.files or 'file2' not in request.files:
        print("ERROR: Missing files in request")
        return jsonify({'error': 'Both files are required'}), 400
    
    file1 = request.files['file1']
    file2 = request.files['file2']
    
    print(f"File1: {file1.filename}, File2: {file2.filename}")
    
    if file1.filename == '' or file2.filename == '':
        print("ERROR: Empty filenames")
        return jsonify({'error': 'No files selected'}), 400
    
    if not (allowed_file(file1.filename) and allowed_file(file2.filename)):
        print("ERROR: Invalid file types")
        return jsonify({'error': 'Only .gpx files are allowed'}), 400
    
    try:
        print("Starting GPX processing...")
        # Save uploaded files temporarily
        filename1 = secure_filename(file1.filename)
        filename2 = secure_filename(file2.filename)
        
        filepath1 = os.path.join(UPLOAD_FOLDER, filename1)
        filepath2 = os.path.join(UPLOAD_FOLDER, filename2)
        
        print(f"Saving files to: {filepath1}, {filepath2}")
        file1.save(filepath1)
        file2.save(filepath2)
        print("Files saved successfully")
        
        # Create output filename
        output_filename = 'comparison_result.jpg'
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)
        
        print(f"Output path: {output_path}")
        
        # Run the Python script that processes GPX files
        script_path = os.path.join(os.path.dirname(__file__), 'gpx_processor.py')
        print(f"Running script: {script_path}")
        print(f"Command: python3 {script_path} {filepath1} {filepath2} {output_path}")
        
        result = subprocess.run([
            'python3', script_path, 
            filepath1, filepath2, output_path, map_type
        ], capture_output=True, text=True)
        
        print(f"Script completed with return code: {result.returncode}")
        
        if result.returncode != 0:
            print(f"GPX processing failed with return code {result.returncode}")
            print(f"STDERR: {result.stderr}")
            print(f"STDOUT: {result.stdout}")
            return jsonify({'error': 'Failed to process GPX files', 'details': result.stderr}), 500
        
        # Return the generated image
        print(f"Checking if output file exists: {output_path}")
        print(f"File exists: {os.path.exists(output_path)}")
        if os.path.exists(output_path):
            print("Sending file...")
            return send_file(output_path, mimetype='image/jpeg')
        else:
            print(f"Output file does not exist at: {output_path}")
            print(f"Contents of upload folder: {os.listdir(UPLOAD_FOLDER) if os.path.exists(UPLOAD_FOLDER) else 'Upload folder does not exist'}")
            return jsonify({'error': 'Failed to generate comparison image'}), 500
            
    except Exception as e:
        print(f"EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up uploaded files
        try:
            if os.path.exists(filepath1):
                os.remove(filepath1)
            if os.path.exists(filepath2):
                os.remove(filepath2)
        except:
            pass

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'})

@app.route('/api/test', methods=['GET'])
def test():
    print("Test endpoint called")
    return jsonify({'message': 'Backend is working!'})

# Serve React frontend
@app.route('/')
def serve_frontend():
    frontend_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')
    if os.path.exists(frontend_folder):
        return send_from_directory(frontend_folder, 'index.html')
    else:
        return jsonify({'error': 'Frontend not found'}), 404

# Serve static assets (JS, CSS, images, etc.)
@app.route('/assets/<path:path>')
def serve_assets(path):
    frontend_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')
    return send_from_directory(os.path.join(frontend_folder, 'assets'), path)

# Catch-all route for React Router (only for non-API routes)
@app.route('/<path:path>')
def serve_spa(path):
    # Don't handle API routes
    if path.startswith('api/'):
        return jsonify({'error': 'API endpoint not found'}), 404
    
    # For other routes, serve the React app
    return serve_frontend()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)