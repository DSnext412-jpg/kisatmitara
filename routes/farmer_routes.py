from flask import Blueprint, g, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from models import Order, OrderItem, Product, db
from routes.helpers import (
    create_notification,
    order_to_dict,
    product_to_dict,
    restore_order_stock,
    role_required,
)

farmer_bp = Blueprint("farmer", __name__)

ORDER_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Cancelled"]
ALLOWED_ORDER_TRANSITIONS = {
    "Pending": {"Confirmed", "Cancelled"},
    "Confirmed": {"Dispatched", "Cancelled"},
    "Dispatched": {"Delivered"},
    "Delivered": set(),
    "Cancelled": set(),
}


@farmer_bp.route("/api/farmer/products")
@role_required("farmer")
def farmer_products():
    products = (
        Product.query.filter_by(farmer_id=g.current_user.id)
        .order_by(Product.created_at.desc())
        .all()
    )
    return jsonify([product_to_dict(product) for product in products])


@farmer_bp.route("/api/farmer/orders")
@role_required("farmer")
def farmer_orders():
    orders = (
        Order.query.join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .filter(Product.farmer_id == g.current_user.id)
        .distinct()
        .order_by(Order.order_date.desc())
        .all()
    )
    return jsonify(
        [order_to_dict(order, farmer_id=g.current_user.id) for order in orders]
    )


@farmer_bp.route("/api/farmer/orders/<int:order_id>/status", methods=["POST"])
@role_required("farmer")
def update_order_status(order_id):
    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").strip()

    if new_status not in ORDER_STATUSES:
        return jsonify({"error": "Invalid order status."}), 400

    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found."}), 404

    contains_farmer_product = any(
        item.product and item.product.farmer_id == g.current_user.id
        for item in order.items
    )
    if not contains_farmer_product:
        return jsonify({"error": "You cannot update this order."}), 403

    allowed_next_statuses = ALLOWED_ORDER_TRANSITIONS.get(order.status, set())
    if new_status not in allowed_next_statuses:
        return (
            jsonify(
                {
                    "error": (
                        f"Order cannot change from {order.status} "
                        f"to {new_status}."
                    )
                }
            ),
            400,
        )

    if new_status == "Cancelled":
        restore_order_stock(order)
    order.status = new_status

    if new_status == "Confirmed":
        create_notification(
            order.customer_id, f"Order #{order.id} was confirmed."
        )
    elif new_status == "Dispatched":
        create_notification(
            order.customer_id,
            f"Order #{order.id} was dispatched and is ready for delivery.",
        )
    elif new_status == "Delivered":
        create_notification(
            order.customer_id, f"Order #{order.id} was delivered."
        )
    elif new_status == "Cancelled":
        create_notification(
            order.customer_id, f"Order #{order.id} was cancelled."
        )

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not update the order."}), 500

    return jsonify(
        {
            "message": "Order status updated.",
            "order": order_to_dict(order, farmer_id=g.current_user.id),
        }
    )
