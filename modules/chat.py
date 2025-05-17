from flask import Blueprint, request, jsonify

chat_bp = Blueprint('chat', __name__)

@chat_bp.route("/chat", methods=["POST"])
def chat_route():
    user_input = request.json.get("message", "")
    return jsonify({"response": f"You said: {user_input}"})