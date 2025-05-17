import os
import uuid
import logging
import subprocess
import json
import tempfile
import threading
from flask import Blueprint, render_template, request, jsonify, current_app, send_file
from werkzeug.utils import secure_filename
import numpy as np
from datetime import datetime

anime_editor_bp = Blueprint('anime_editor', __name__, url_prefix='/anime_editor')

# Track running jobs
running_jobs = {}

@anime_editor_bp.route('/', methods=['GET'])
def anime_editor_page():
    return render_template('anime_editor.html')

def allowed_video_file(filename):
    """Check if the file is an allowed video format"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'mp4', 'mkv', 'avi'}

def detect_scenes(job_id, video_path, output_dir):
    """Detect scenes in the video using PySceneDetect"""
    try:
        logging.info(f"Starting scene detection for job {job_id}")
        running_jobs[job_id]["status"] = "processing"
        running_jobs[job_id]["progress"] = 10
        running_jobs[job_id]["current_step"] = "Detecting scenes..."
        
        # Create temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            # Detect scenes using PySceneDetect
            scenes_json_path = os.path.join(temp_dir, "scenes.json")
            
            # Run PySceneDetect
            scenedetect_cmd = [
                "scenedetect",
                "-i", video_path,
                "detect-content",
                "-t", "30",  # Threshold for scene detection (adjust as needed)
                "list-scenes",
                "-o", scenes_json_path,
                "-f", "json"
            ]
            
            subprocess.run(scenedetect_cmd, check=True, capture_output=True, text=True)
            
            if not os.path.exists(scenes_json_path):
                raise Exception("Failed to detect scenes")
            
            # Read detected scenes
            with open(scenes_json_path, 'r') as f:
                scenes_data = json.load(f)
            
            # Extract scene information
            scenes = []
            for scene in scenes_data.get('scenes', []):
                start_time = scene.get('start_time', 0)
                end_time = scene.get('end_time', 0)
                
                # Generate thumbnail for the scene
                thumbnail_path = os.path.join(output_dir, f"thumb_{job_id}_{len(scenes)}.jpg")
                
                # Extract frame at the middle of the scene
                middle_time = (start_time + end_time) / 2
                ffmpeg_thumb_cmd = [
                    "ffmpeg",
                    "-ss", str(middle_time),
                    "-i", video_path,
                    "-vframes", "1",
                    "-q:v", "2",
                    thumbnail_path
                ]
                subprocess.run(ffmpeg_thumb_cmd, check=True, capture_output=True, text=True)
                
                scenes.append({
                    "id": len(scenes),
                    "start_time": start_time,
                    "end_time": end_time,
                    "duration": end_time - start_time,
                    "thumbnail": os.path.basename(thumbnail_path)
                })
                
                # Update progress
                progress = 10 + (80 * len(scenes) / len(scenes_data.get('scenes', [])))
                running_jobs[job_id]["progress"] = min(90, progress)
            
            # Save scenes data
            scenes_path = os.path.join(output_dir, f"scenes_{job_id}.json")
            with open(scenes_path, 'w') as f:
                json.dump(scenes, f, indent=2)
            
            # Update job status and result
            running_jobs[job_id]["progress"] = 100
            running_jobs[job_id]["status"] = "scenes_detected"
            running_jobs[job_id]["current_step"] = "Scenes detected successfully"
            running_jobs[job_id]["results"] = {
                "scenes_file": os.path.basename(scenes_path),
                "scenes_count": len(scenes),
                "scenes": scenes
            }
            
            logging.info(f"Scene detection completed for job {job_id}: found {len(scenes)} scenes")
    
    except Exception as e:
        logging.error(f"Error detecting scenes for job {job_id}: {str(e)}")
        running_jobs[job_id]["status"] = "error"
        running_jobs[job_id]["error"] = str(e)

def create_edited_video(job_id, video_path, music_path, selected_scenes, output_dir):
    """Create edited video with selected scenes and synchronized music"""
    try:
        logging.info(f"Starting video editing for job {job_id}")
        running_jobs[job_id]["status"] = "editing"
        running_jobs[job_id]["progress"] = 0
        running_jobs[job_id]["current_step"] = "Preparing to create edited video..."
        
        # Create temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            # Extract selected scenes
            scene_clips = []
            for i, scene_id in enumerate(selected_scenes):
                scene = next((s for s in running_jobs[job_id]["results"]["scenes"] if s["id"] == scene_id), None)
                if scene:
                    scene_clip_path = os.path.join(temp_dir, f"scene_{i}.mp4")
                    
                    # Extract scene using ffmpeg
                    ffmpeg_extract_cmd = [
                        "ffmpeg",
                        "-i", video_path,
                        "-ss", str(scene["start_time"]),
                        "-to", str(scene["end_time"]),
                        "-c:v", "libx264",
                        "-c:a", "aac",
                        "-strict", "experimental",
                        scene_clip_path
                    ]
                    subprocess.run(ffmpeg_extract_cmd, check=True, capture_output=True, text=True)
                    scene_clips.append(scene_clip_path)
                
                # Update progress
                progress = 5 + (45 * (i + 1) / len(selected_scenes))
                running_jobs[job_id]["progress"] = progress
                running_jobs[job_id]["current_step"] = f"Extracting scene {i+1} of {len(selected_scenes)}"
            
            # Create a file with the list of clips
            clips_list_path = os.path.join(temp_dir, "clips_list.txt")
            with open(clips_list_path, 'w') as f:
                for clip in scene_clips:
                    f.write(f"file '{clip}'\n")
            
            # Concatenate clips
            concat_output_path = os.path.join(temp_dir, "concat_output.mp4")
            ffmpeg_concat_cmd = [
                "ffmpeg",
                "-f", "concat",
                "-safe", "0",
                "-i", clips_list_path,
                "-c", "copy",
                concat_output_path
            ]
            subprocess.run(ffmpeg_concat_cmd, check=True, capture_output=True, text=True)
            
            running_jobs[job_id]["progress"] = 60
            running_jobs[job_id]["current_step"] = "Adding music with beat synchronization..."
            
            # Process the music using librosa for beat detection
            # Since we can't import librosa directly here, we'll use a Python subprocess
            beat_script = os.path.join(temp_dir, "beat_detection.py")
            with open(beat_script, 'w') as f:
                f.write("""
import os
import sys
import json
import librosa
import numpy as np

def detect_beats(audio_path):
    y, sr = librosa.load(audio_path)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    return {
        "tempo": float(tempo),
        "beat_times": beat_times.tolist()
    }

if __name__ == "__main__":
    audio_path = sys.argv[1]
    output_path = sys.argv[2]
    
    beats = detect_beats(audio_path)
    
    with open(output_path, 'w') as f:
        json.dump(beats, f)
""")
            
            # Run beat detection
            beats_json_path = os.path.join(temp_dir, "beats.json")
            beat_cmd = ["python", beat_script, music_path, beats_json_path]
            subprocess.run(beat_cmd, check=True, capture_output=True, text=True)
            
            # Add music to the concatenated video
            final_output_path = os.path.join(output_dir, f"edited_{job_id}.mp4")
            ffmpeg_music_cmd = [
                "ffmpeg",
                "-i", concat_output_path,
                "-i", music_path,
                "-map", "0:v",
                "-map", "1:a",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                final_output_path
            ]
            subprocess.run(ffmpeg_music_cmd, check=True, capture_output=True, text=True)
            
            # Update job status and result
            running_jobs[job_id]["progress"] = 100
            running_jobs[job_id]["status"] = "completed"
            running_jobs[job_id]["current_step"] = "Video editing completed successfully"
            running_jobs[job_id]["results"]["edited_video"] = os.path.basename(final_output_path)
            
            logging.info(f"Video editing completed for job {job_id}")
    
    except Exception as e:
        logging.error(f"Error editing video for job {job_id}: {str(e)}")
        running_jobs[job_id]["status"] = "error"
        running_jobs[job_id]["error"] = str(e)

@anime_editor_bp.route('/detect_scenes', methods=['POST'])
def start_scene_detection():
    try:
        if 'video' not in request.files:
            return jsonify({
                "success": False,
                "error": "No video file provided"
            }), 400
        
        video_file = request.files['video']
        
        if video_file.filename == '':
            return jsonify({
                "success": False,
                "error": "No video file selected"
            }), 400
        
        if not allowed_video_file(video_file.filename):
            return jsonify({
                "success": False,
                "error": "Only MP4, MKV, and AVI video files are allowed"
            }), 400
        
        # Create job ID and directories
        job_id = str(uuid.uuid4())
        upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'videos')
        output_dir = os.path.join(current_app.config['RESULTS_FOLDER'], 'edited')
        os.makedirs(upload_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        
        # Save uploaded video
        filename = secure_filename(video_file.filename)
        video_path = os.path.join(upload_dir, f"{job_id}_{filename}")
        video_file.save(video_path)
        
        # Start scene detection in a separate thread
        running_jobs[job_id] = {
            "id": job_id,
            "filename": filename,
            "video_path": video_path,
            "status": "starting",
            "progress": 0,
            "current_step": "Job queued",
            "start_time": datetime.now().isoformat(),
            "results": None,
            "error": None
        }
        
        thread = threading.Thread(
            target=detect_scenes,
            args=(job_id, video_path, output_dir)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "job_id": job_id,
            "message": "Scene detection started"
        })
    
    except Exception as e:
        logging.error(f"Error starting scene detection: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Error starting scene detection: {str(e)}"
        }), 500

@anime_editor_bp.route('/edit_video', methods=['POST'])
def start_video_editing():
    try:
        data = request.json
        job_id = data.get('job_id')
        selected_scenes = data.get('selected_scenes', [])
        music_url = data.get('music_url')
        
        if not job_id:
            return jsonify({
                "success": False,
                "error": "Job ID is required"
            }), 400
        
        if job_id not in running_jobs:
            return jsonify({
                "success": False,
                "error": "Job not found"
            }), 404
        
        if running_jobs[job_id]["status"] != "scenes_detected":
            return jsonify({
                "success": False,
                "error": "Scene detection must be completed first"
            }), 400
        
        if not selected_scenes:
            return jsonify({
                "success": False,
                "error": "No scenes selected"
            }), 400
        
        if not music_url:
            return jsonify({
                "success": False,
                "error": "YouTube music URL is required"
            }), 400
        
        # Get video path from job
        video_path = running_jobs[job_id]["video_path"]
        output_dir = os.path.join(current_app.config['RESULTS_FOLDER'], 'edited')
        
        # Download music from YouTube
        music_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'music')
        os.makedirs(music_dir, exist_ok=True)
        music_path = os.path.join(music_dir, f"music_{job_id}.mp3")
        
        # Update job status
        running_jobs[job_id]["status"] = "downloading_music"
        running_jobs[job_id]["progress"] = 0
        running_jobs[job_id]["current_step"] = "Downloading music..."
        
        # Download music using yt-dlp
        ytdlp_cmd = [
            "yt-dlp", 
            "-x", 
            "--audio-format", "mp3",
            "-o", music_path,
            music_url
        ]
        subprocess.run(ytdlp_cmd, check=True, capture_output=True, text=True)
        
        if not os.path.exists(music_path):
            return jsonify({
                "success": False,
                "error": "Failed to download music"
            }), 500
        
        # Start video editing in a separate thread
        thread = threading.Thread(
            target=create_edited_video,
            args=(job_id, video_path, music_path, selected_scenes, output_dir)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "job_id": job_id,
            "message": "Video editing started"
        })
    
    except Exception as e:
        logging.error(f"Error starting video editing: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Error starting video editing: {str(e)}"
        }), 500

@anime_editor_bp.route('/status/<job_id>', methods=['GET'])
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

@anime_editor_bp.route('/thumbnail/<job_id>/<scene_id>', methods=['GET'])
def get_thumbnail(job_id, scene_id):
    output_dir = os.path.join(current_app.config['RESULTS_FOLDER'], 'edited')
    thumbnail_path = os.path.join(output_dir, f"thumb_{job_id}_{scene_id}.jpg")
    
    if not os.path.exists(thumbnail_path):
        return jsonify({
            "success": False,
            "error": "Thumbnail not found"
        }), 404
    
    return send_file(
        thumbnail_path,
        mimetype="image/jpeg"
    )

@anime_editor_bp.route('/download/<job_id>', methods=['GET'])
def download_edited_video(job_id):
    if job_id not in running_jobs:
        return jsonify({
            "success": False,
            "error": "Job not found"
        }), 404
    
    job = running_jobs[job_id]
    
    if job['status'] != 'completed':
        return jsonify({
            "success": False,
            "error": "Video editing has not completed yet"
        }), 400
    
    if 'results' not in job or 'edited_video' not in job['results']:
        return jsonify({
            "success": False,
            "error": "No results available"
        }), 404
    
    file_path = os.path.join(current_app.config['RESULTS_FOLDER'], 'edited', job['results']['edited_video'])
    
    if not os.path.exists(file_path):
        return jsonify({
            "success": False,
            "error": "File not found"
        }), 404
    
    return send_file(
        file_path,
        as_attachment=True,
        download_name=job['results']['edited_video'],
        mimetype="video/mp4"
    )
