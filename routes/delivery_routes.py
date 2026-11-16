from flask import Blueprint, g, jsonify
from sqlalchemy.exc import SQLAlchemyError

from models import Order, db
from routes.helpers import (
    create_notification,
    order_farmer_id,
    order_to_dict,
    role_required,
)

delivery_bp = Blueprint("delivery", __name__)


@delivery_bp.route("/api/agent/deliveries")
@role_required("delivery_agent")
def agent_deliveries():
    available = (
        Order.query.filter_by(status="Dispatched", delivery_agent_id=None)
        .order_by(Order.order_date.asc())
        .all()
    )
    assigned = (
        Order.query.filter_by(
            status="Dispatched", delivery_agent_id=g.current_user.id
        )
        .order_by(Order.order_date.asc())
        .all()
    )
    completed = (
        Order.query.filter_by(
            status="Delivered", delivery_agent_id=g.current_user.id
        )
        .order_by(Order.order_date.desc())
        .all()
    )

    return jsonify(
        {
            "available": [order_to_dict(order) for order in available],
            "assigned": [order_to_dict(order) for order in assigned],
            "completed": [order_to_dict(order) for order in completed],
        }
    )


@delivery_bp.route("/api/agent/deliveries/<int:order_id>")
@role_required("delivery_agent")
def agent_delivery_details(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found."}), 404
    if order.delivery_agent_id != g.current_user.id:
        return jsonify({"error": "This delivery is not assigned to you."}), 403
    return jsonify(order_to_dict(order))


@delivery_bp.route("/api/agent/deliveries/<int:order_id>/accept", methods=["POST"])
@role_required("delivery_agent")
def accept_delivery(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found."}), 404
    if order.status != "Dispatched":
        return (
            jsonify({"error": "Only dispatched orders can be accepted."}),
            400,
        )
    if order.delivery_agent_id is not None:
        return (
            jsonify({"error": "This delivery has already been accepted."}),
            400,
        )

    order.delivery_agent_id = g.current_user.id
    create_notification(
        order.customer_id,
        f"Delivery partner {g.current_user.name} assigned for order #{order.id}.",
    )
    create_notification(
        order_farmer_id(order),
        f"Delivery partner {g.current_user.name} accepted order #{order.id}.",
    )
    create_notification(
        g.current_user.id, f"You accepted order #{order.id} for delivery."
    )

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not accept the delivery."}), 500

    return jsonify(
        {
            "message": "Delivery accepted.",
            "order": order_to_dict(order),
        }
    )


@delivery_bp.route("/api/agent/deliveries/<int:order_id>/deliver", methods=["POST"])
@role_required("delivery_agent")
def complete_delivery(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found."}), 404
    if order.delivery_agent_id != g.current_user.id:
        return jsonify({"error": "This delivery is not assigned to you."}), 403
    if order.status != "Dispatched":
        return (
            jsonify({"error": "Only dispatched deliveries can be completed."}),
            400,
        )

    order.status = "Delivered"
    create_notification(
        order.customer_id, f"Order #{order.id} was delivered."
    )
    create_notification(
        order_farmer_id(order), f"Order #{order.id} was delivered."
    )
    create_notification(
        g.current_user.id, f"You completed order #{order.id}."
    )

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not complete the delivery."}), 500

    return jsonify(
        {
            "message": "Delivery completed.",
            "order": order_to_dict(order),
        }
    )
