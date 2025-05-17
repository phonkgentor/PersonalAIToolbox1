import os
import json
import logging
from flask import Blueprint, render_template, request, jsonify
from openai import OpenAI

chat_bp = Blueprint('chat', __name__, url_prefix='/chat')

# Initialize OpenAI client
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# Chat history will be stored in memory (for simplicity)
# In a production environment, this should be stored in a database
chat_histories = {}

@chat_bp.route('/', methods=['GET'])
def chat_page():
    return render_template('chat.html')

@chat_bp.route('/send', methods=['POST'])
def send_message():
    try:
        data = request.json
        user_message = data.get('message', '')
        session_id = data.get('session_id', 'default')
        
        # Initialize chat history for this session if it doesn't exist
        if session_id not in chat_histories:
            chat_histories[session_id] = []
        
        # Add user message to history
        chat_histories[session_id].append({"role": "user", "content": user_message})
        
        # If OpenAI API key is not set, use a mock response
        if not OPENAI_API_KEY:
            ai_response = "I'm sorry, the OpenAI API key is not configured. Please set the OPENAI_API_KEY environment variable."
            logging.warning("OpenAI API key not set. Using mock response.")
        else:
            # Send the full conversation history to maintain context
            response = openai_client.chat.completions.create(
                model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
                messages=chat_histories[session_id],
                max_tokens=500
            )
            ai_response = response.choices[0].message.content
        
        # Add AI response to history
        chat_histories[session_id].append({"role": "assistant", "content": ai_response})
        
        return jsonify({
            "success": True,
            "message": ai_response
        })
    
    except Exception as e:
        logging.error(f"Error in chat: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@chat_bp.route('/history', methods=['GET'])
def get_chat_history():
    session_id = request.args.get('session_id', 'default')
    if session_id in chat_histories:
        return jsonify({
            "success": True,
            "history": chat_histories[session_id]
        })
    return jsonify({
        "success": True,
        "history": []
    })

@chat_bp.route('/clear', methods=['POST'])
def clear_chat_history():
    session_id = request.json.get('session_id', 'default')
    if session_id in chat_histories:
        chat_histories[session_id] = []
    return jsonify({"success": True})
