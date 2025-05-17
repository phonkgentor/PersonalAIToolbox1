import os
import uuid
import logging
import subprocess
import json
import tempfile
import threading
from flask import Blueprint, render_template, request, jsonify, current_app, send_file
from werkzeug.utils import secure_filename
import subprocess
import random
from datetime import datetime

amv_generator_bp = Blueprint('amv_generator', __name__, url_prefix='/amv_generator')

# Track running jobs
running_jobs = {}

@amv_generator_bp.route('/', methods=['GET'])
def amv_generator_page():
    return render_template('amv_generator.html')

def allowed_video_file(filename):
    """Check if the file is an allowed video format"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'mp4', 'mkv', 'avi'}

def generate_amv(job_id, video_path, music_url, output_dir):
    """Generate AMV clips with background music"""
    try:
        logging.info(f"Starting AMV generation for job {job_id}")
        running_jobs[job_id]["status"] = "processing"
        running_jobs[job_id]["progress"] = 10
        
        # Create temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download music from YouTube using yt-dlp
            music_path = os.path.join(temp_dir, "music.mp3")
            running_jobs[job_id]["progress"] = 20
            running_jobs[job_id]["current_step"] = "Downloading music..."
            
            ytdlp_cmd = [
                "yt-dlp", 
                "-x", 
                "--audio-format", "mp3",
                "-o", music_path,
                music_url
            ]
            subprocess.run(ytdlp_cmd, check=True, capture_output=True, text=True)
            
            if not os.path.exists(music_path):
                raise Exception("Failed to download music file")
            
            running_jobs[job_id]["progress"] = 30
            running_jobs[job_id]["current_step"] = "Extracting 3-minute clip..."
            
            # Create 3-minute clip
            three_min_clip_path = os.path.join(temp_dir, "3min_clip.mp4")
            ffmpeg_3min_cmd = [
                "ffmpeg",
                "-i", video_path,
                "-ss", "00:05:00",  # Start from 5 minutes to avoid intros
                "-t", "00:03:00",   # 3 minutes duration
                "-c:v", "libx264",
                "-c:a", "aac",
                "-strict", "experimental",
                three_min_clip_path
            ]
            subprocess.run(ffmpeg_3min_cmd, check=True, capture_output=True, text=True)
            
            running_jobs[job_id]["progress"] = 50
            running_jobs[job_id]["current_step"] = "Extracting 1-minute clip..."
            
            # Create 1-minute clip
            one_min_clip_path = os.path.join(temp_dir, "1min_clip.mp4")
            ffmpeg_1min_cmd = [
                "ffmpeg",
                "-i", video_path,
                "-ss", "00:10:00",  # Start from 10 minutes to get interesting action
                "-t", "00:01:00",   # 1 minute duration
                "-c:v", "libx264",
                "-c:a", "aac",
                "-strict", "experimental",
                one_min_clip_path
            ]
            subprocess.run(ffmpeg_1min_cmd, check=True, capture_output=True, text=True)
            
            running_jobs[job_id]["progress"] = 70
            running_jobs[job_id]["current_step"] = "Adding music to 3-minute clip..."
            
            # Add music to 3-minute clip
            three_min_amv_path = os.path.join(output_dir, f"3min_amv_{job_id}.mp4")
            ffmpeg_3min_amv_cmd = [
                "ffmpeg",
                "-i", three_min_clip_path,
                "-i", music_path,
                "-map", "0:v",
                "-map", "1:a",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                three_min_amv_path
            ]
            subprocess.run(ffmpeg_3min_amv_cmd, check=True, capture_output=True, text=True)
            
            running_jobs[job_id]["progress"] = 85
            running_jobs[job_id]["current_step"] = "Adding music to 1-minute clip..."
            
            # Add music to 1-minute clip
            one_min_amv_path = os.path.join(output_dir, f"1min_amv_{job_id}.mp4")
            ffmpeg_1min_amv_cmd = [
                "ffmpeg",
                "-i", one_min_clip_path,
                "-i", music_path,
                "-map", "0:v",
                "-map", "1:a",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                one_min_amv_path
            ]
            subprocess.run(ffmpeg_1min_amv_cmd, check=True, capture_output=True, text=True)
            
            # Update job status and result
            running_jobs[job_id]["progress"] = 100
            running_jobs[job_id]["status"] = "completed"
            running_jobs[job_id]["current_step"] = "AMVs generated successfully"
            running_jobs[job_id]["results"] = {
                "three_min_amv": os.path.basename(three_min_amv_path),
                "one_min_amv": os.path.basename(one_min_amv_path)
            }
            
            logging.info(f"AMV generation completed for job {job_id}")
    
    except Exception as e:
        logging.error(f"Error generating AMV for job {job_id}: {str(e)}")
        running_jobs[job_id]["status"] = "error"
        running_jobs[job_id]["error"] = str(e)

@amv_generator_bp.route('/generate', methods=['POST'])
def start_amv_generation():
    try:
        if 'video' not in request.files:
            return jsonify({
                "success": False,
                "error": "No video file provided"
            }), 400
        
        video_file = request.files['video']
        music_url = request.form.get('music_url')
        
        if video_file.filename == '':
            return jsonify({
                "success": False,
                "error": "No video file selected"
            }), 400
        
        if not music_url:
            return jsonify({
                "success": False,
                "error": "YouTube music URL is required"
            }), 400
        
        if not allowed_video_file(video_file.filename):
            return jsonify({
                "success": False,
                "error": "Only MP4, MKV, and AVI video files are allowed"
            }), 400
        
        # Create job ID and directories
        job_id = str(uuid.uuid4())
        upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'videos')
        output_dir = os.path.join(current_app.config['RESULTS_FOLDER'], 'amv')
        os.makedirs(upload_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        
        # Save uploaded video
        filename = secure_filename(video_file.filename)
        video_path = os.path.join(upload_dir, f"{job_id}_{filename}")
        video_file.save(video_path)
        
        # Start AMV generation in a separate thread
        running_jobs[job_id] = {
            "id": job_id,
            "filename": filename,
            "status": "starting",
            "progress": 0,
            "current_step": "Job queued",
            "start_time": datetime.now().isoformat(),
            "results": None,
            "error": None
        }
        
        thread = threading.Thread(
            target=generate_amv,
            args=(job_id, video_path, music_url, output_dir)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "job_id": job_id,
            "message": "AMV generation started"
        })
    
    except Exception as e:
        logging.error(f"Error starting AMV generation: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Error starting AMV generation: {str(e)}"
        }), 500

@amv_generator_bp.route('/status/<job_id>', methods=['GET'])
def get_job_status(job_id):
    if job_id not in running_jobs:
        return jsonify({
            "success": False,
            "error": "Job not found"
        }), 404
    
    return jsonify({
        "success": True,
        "job": running_jobs[job_id]
    })

@amv_generator_bp.route('/download/<job_id>/<clip_type>', methods=['GET'])
def download_amv(job_id, clip_type):
    if job_id not in running_jobs:
        return jsonify({
            "success": False,
            "error": "Job not found"
        }), 404
    
    job = running_jobs[job_id]
    
    if job['status'] != 'completed':
        return jsonify({
            "success": False,
            "error": "AMV generation has not completed yet"
        }), 400
    
    if job['results'] is None:
        return jsonify({
            "success": False,
            "error": "No results available"
        }), 404
    
    if clip_type == 'three_min':
        file_name = job['results']['three_min_amv']
    elif clip_type == 'one_min':
        file_name = job['results']['one_min_amv']
    else:
        return jsonify({
            "success": False,
            "error": "Invalid clip type"
        }), 400
    
    file_path = os.path.join(current_app.config['RESULTS_FOLDER'], 'amv', file_name)
    
    if not os.path.exists(file_path):
        return jsonify({
            "success": False,
            "error": "File not found"
        }), 404
    
    return send_file(
        file_path,
        as_attachment=True,
        download_name=file_name,
        mimetype="video/mp4"
    )
