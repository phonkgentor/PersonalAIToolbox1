import os
import logging
from flask import Flask, render_template
from werkzeug.middleware.proxy_fix import ProxyFix

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Create the app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Configure upload sizes for video files
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max size
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['RESULTS_FOLDER'] = 'results'

# Create necessary directories if they don't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['RESULTS_FOLDER'], exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'code'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'videos'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'music'), exist_ok=True)
os.makedirs(os.path.join(app.config['RESULTS_FOLDER'], 'reports'), exist_ok=True)
os.makedirs(os.path.join(app.config['RESULTS_FOLDER'], 'amv'), exist_ok=True)
os.makedirs(os.path.join(app.config['RESULTS_FOLDER'], 'edited'), exist_ok=True)

# Import routes
from modules.chat import chat_bp
from modules.bug_scanner import bug_scanner_bp
from modules.amv_generator import amv_generator_bp
from modules.anime_editor import anime_editor_bp

# Register blueprints
app.register_blueprint(chat_bp)
app.register_blueprint(bug_scanner_bp)
app.register_blueprint(amv_generator_bp)
app.register_blueprint(anime_editor_bp)

# Main route
@app.route('/')
def index():
    return render_template('index.html')

# Error handlers
@app.errorhandler(413)
def request_entity_too_large(error):
    return render_template('index.html', error="File too large. Maximum size is 500MB."), 413

@app.errorhandler(500)
def internal_server_error(error):
    app.logger.error(f"Server error: {error}")
    return render_template('index.html', error="Internal server error. Please try again later."), 500

@app.errorhandler(404)
def page_not_found(error):
    return render_template('index.html', error="Page not found."), 404
