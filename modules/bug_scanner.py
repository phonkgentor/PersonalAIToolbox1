import os
import json
import subprocess
import logging
import tempfile
import uuid
from flask import Blueprint, render_template, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename

bug_scanner_bp = Blueprint('bug_scanner', __name__, url_prefix='/bug_scanner')

@bug_scanner_bp.route('/', methods=['GET'])
def bug_scanner_page():
    return render_template('bug_scanner.html')

def allowed_file(filename):
    """Check if the file is a Python file"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() == 'py'

@bug_scanner_bp.route('/scan', methods=['POST'])
def scan_code():
    if 'file' not in request.files:
        return jsonify({
            "success": False,
            "error": "No file provided"
        }), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({
            "success": False,
            "error": "No file selected"
        }), 400
    
    if not allowed_file(file.filename):
        return jsonify({
            "success": False,
            "error": "Only Python (.py) files are allowed"
        }), 400
    
    try:
        # Create a unique ID for this scan
        scan_id = str(uuid.uuid4())
        
        # Save uploaded file
        filename = secure_filename(file.filename)
        upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'code')
        file_path = os.path.join(upload_dir, f"{scan_id}_{filename}")
        file.save(file_path)
        
        # Create report directory
        report_dir = os.path.join(current_app.config['RESULTS_FOLDER'], 'reports', scan_id)
        os.makedirs(report_dir, exist_ok=True)
        
        # Run Bandit scan
        bandit_report_path = os.path.join(report_dir, "bandit_report.json")
        bandit_cmd = ["bandit", "-r", file_path, "-f", "json", "-o", bandit_report_path]
        try:
            bandit_result = subprocess.run(bandit_cmd, check=True, capture_output=True, text=True)
            logging.debug(f"Bandit scan completed: {bandit_result.stdout}")
        except subprocess.CalledProcessError as e:
            # Bandit returns non-zero exit code when it finds issues, which is normal
            logging.debug(f"Bandit scan found issues (expected): {e.stderr}")
        
        # Run Semgrep scan
        semgrep_report_path = os.path.join(report_dir, "semgrep_report.json")
        semgrep_cmd = [
            "semgrep", 
            "--config=auto",
            file_path,
            "--json",
            "--output", semgrep_report_path
        ]
        try:
            semgrep_result = subprocess.run(semgrep_cmd, check=True, capture_output=True, text=True)
            logging.debug(f"Semgrep scan completed: {semgrep_result.stdout}")
        except subprocess.CalledProcessError as e:
            logging.error(f"Semgrep scan error: {e.stderr}")
            # Continue with partial results
        
        # Prepare combined report
        combined_report_path = os.path.join(report_dir, "combined_report.json")
        combined_report = {
            "filename": filename,
            "scan_id": scan_id,
            "bandit_results": {},
            "semgrep_results": {}
        }
        
        # Read Bandit results if available
        if os.path.exists(bandit_report_path):
            try:
                with open(bandit_report_path, 'r') as f:
                    bandit_data = json.load(f)
                    combined_report["bandit_results"] = bandit_data
            except json.JSONDecodeError:
                logging.error("Failed to parse Bandit results")
                combined_report["bandit_results"] = {"error": "Failed to parse results"}
        
        # Read Semgrep results if available
        if os.path.exists(semgrep_report_path):
            try:
                with open(semgrep_report_path, 'r') as f:
                    semgrep_data = json.load(f)
                    combined_report["semgrep_results"] = semgrep_data
            except json.JSONDecodeError:
                logging.error("Failed to parse Semgrep results")
                combined_report["semgrep_results"] = {"error": "Failed to parse results"}
        
        # Save combined report
        with open(combined_report_path, 'w') as f:
            json.dump(combined_report, f, indent=2)
        
        return jsonify({
            "success": True,
            "scan_id": scan_id,
            "filename": filename,
            "message": "Scan completed successfully. You can now download the report."
        })
    
    except Exception as e:
        logging.error(f"Error scanning code: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Error scanning code: {str(e)}"
        }), 500

@bug_scanner_bp.route('/report/<scan_id>', methods=['GET'])
def get_report(scan_id):
    try:
        report_path = os.path.join(current_app.config['RESULTS_FOLDER'], 'reports', scan_id, "combined_report.json")
        
        if not os.path.exists(report_path):
            return jsonify({
                "success": False,
                "error": "Report not found"
            }), 404
        
        with open(report_path, 'r') as f:
            report_data = json.load(f)
        
        return jsonify({
            "success": True,
            "report": report_data
        })
    
    except Exception as e:
        logging.error(f"Error getting report: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Error getting report: {str(e)}"
        }), 500

@bug_scanner_bp.route('/download/<scan_id>', methods=['GET'])
def download_report(scan_id):
    try:
        report_path = os.path.join(current_app.config['RESULTS_FOLDER'], 'reports', scan_id, "combined_report.json")
        
        if not os.path.exists(report_path):
            return jsonify({
                "success": False,
                "error": "Report not found"
            }), 404
        
        return send_file(
            report_path,
            as_attachment=True,
            download_name=f"security_scan_{scan_id}.json",
            mimetype="application/json"
        )
    
    except Exception as e:
        logging.error(f"Error downloading report: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Error downloading report: {str(e)}"
        }), 500
