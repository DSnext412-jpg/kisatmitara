from flask import Blueprint, g, jsonify

from models import Order, db
from routes.helpers import order_to_dict, role_required

customer_bp = Blueprint("customer", __name__)


@customer_bp.route("/api/orders")
@role_required("customer")
def customer_orders():
    orders = (
        Order.query.filter_by(customer_id=g.current_user.id)
        .order_by(Order.order_date.desc())
        .all()
    )
    return jsonify([order_to_dict(order) for order in orders])


@customer_bp.route("/api/orders/<int:order_id>")
@role_required("customer", "farmer")
def order_details(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found."}), 404

    if g.current_user.role == "customer":
        if order.customer_id != g.current_user.id:
            return jsonify({"error": "You cannot view this order."}), 403
        return jsonify(order_to_dict(order))

    contains_farmer_product = any(
        item.product and item.product.farmer_id == g.current_user.id
        for item in order.items
    )
    if not contains_farmer_product:
        return jsonify({"error": "You cannot view this order."}), 403

    return jsonify(order_to_dict(order, farmer_id=g.current_user.id))
