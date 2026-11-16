import re

from flask import Blueprint, jsonify, request, session
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.security import check_password_hash, generate_password_hash

from models import User, db
from routes.helpers import get_current_user, normalise_role, user_to_dict

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or request.form

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    password = data.get("password") or ""
    role = normalise_role(data.get("role"))

    if not name or len(name) > 100:
        return jsonify({"error": "Please enter your full name."}), 400
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"error": "Please enter a valid email address."}), 400
    if not phone or len(phone) > 20:
        return jsonify({"error": "Please enter a valid mobile number."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400
    if not role:
        return jsonify({"error": "Please choose a valid role."}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists."}), 400

    user = User(
        name=name,
        email=email,
        phone=phone,
        password=generate_password_hash(password),
        role=role,
    )

    try:
        db.session.add(user)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not create the account."}), 500

    session.clear()
    session["user_id"] = user.id
    return (
        jsonify(
            {
                "message": "Registration successful.",
                "user": user_to_dict(user),
            }
        ),
        201,
    )


@auth_bp.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or request.form
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password, password):
        return jsonify({"error": "Invalid email or password."}), 401

    session.clear()
    session["user_id"] = user.id
    return jsonify(
        {"message": "Login successful.", "user": user_to_dict(user)}
    )


@auth_bp.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "You have been logged out."})


@auth_bp.route("/api/me")
def me():
    user = get_current_user()
    if not user:
        return jsonify({"user": None})
    return jsonify({"user": user_to_dict(user)})
