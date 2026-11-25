"""Main Flask application for the College ERP System.

Deployed as a Vercel Python serverless function via /api/*.
Also serves static files from ../public during local development.
"""

import os
from dotenv import load_dotenv
from flask import Flask, jsonify

# Load local .env file during development (ignored in production on Vercel)
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "").strip()

app = Flask(__name__, static_folder="../public", static_url_path="")


@app.route("/")
def serve_index():
    """Serve the landing page when running Flask locally."""
    return app.send_static_file("index.html")


@app.route("/api/health", methods=["GET"])
def health_check():
    """Verify the Flask API and environment configuration are active."""
    configured = bool(SUPABASE_URL and SUPABASE_ANON_KEY)
    return jsonify({
        "status": "ok",
        "service": "College ERP API",
        "supabase_configured": configured,
    }), 200


@app.route("/api/config", methods=["GET"])
def public_config():
    """Return public Supabase client configuration for the browser."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return jsonify({"error": "Supabase environment variables are not configured"}), 500
    return jsonify({
        "supabaseUrl": SUPABASE_URL,
        "supabaseAnonKey": SUPABASE_ANON_KEY,
    }), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)
