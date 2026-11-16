from flask import Blueprint, g, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from models import Order, OrderItem, Product, db
from routes.helpers import (
    create_notification,
    get_float,
    order_farmer_id,
    order_to_dict,
    restore_order_stock,
    role_required,
)

order_bp = Blueprint("orders", __name__)


@order_bp.route("/api/orders", methods=["POST"])
@role_required("customer")
def place_order():
    data = request.get_json(silent=True) or {}
    delivery_address = (data.get("delivery_address") or "").strip()
    items = data.get("items")

    if not delivery_address or len(delivery_address) > 255:
        return jsonify({"error": "Please enter a valid delivery address."}), 400
    if not isinstance(items, list) or not items:
        return jsonify({"error": "Your cart is empty."}), 400

    requested = {}
    for item in items:
        product_id = item.get("product_id")
        quantity = get_float(item.get("quantity"))

        try:
            product_id = int(product_id)
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid product in cart."}), 400

        if quantity is None or quantity <= 0:
            return jsonify({"error": "Quantity must be greater than zero."}), 400

        requested[product_id] = round(
            requested.get(product_id, 0) + quantity, 2
        )

    products = Product.query.filter(Product.id.in_(requested.keys())).all()
    product_map = {product.id: product for product in products}

    if len(product_map) != len(requested):
        return jsonify({"error": "One or more products no longer exist."}), 400

    farmer_ids = {product.farmer_id for product in products}
    if len(farmer_ids) > 1:
        return (
            jsonify(
                {
                    "error": (
                        "Your cart contains products from more than one farmer. "
                        "Please order from one farmer at a time."
                    )
                }
            ),
            400,
        )

    total_amount = 0
    for product_id, quantity in requested.items():
        product = product_map[product_id]
        if quantity > product.quantity:
            return (
                jsonify(
                    {
                        "error": (
                            f"Only {product.quantity} {product.unit} of "
                            f"{product.name} is available."
                        )
                    }
                ),
                400,
            )
        total_amount += product.price * quantity

    order = Order(
        customer_id=g.current_user.id,
        total_amount=round(total_amount, 2),
        delivery_address=delivery_address,
        status="Pending",
    )

    try:
        db.session.add(order)
        db.session.flush()

        for product_id, quantity in requested.items():
            product = product_map[product_id]
            db.session.add(
                OrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    quantity=quantity,
                    price=product.price,
                )
            )
            product.quantity = round(product.quantity - quantity, 2)

        farmer_id = next(iter(farmer_ids))
        create_notification(
            farmer_id,
            f"New order #{order.id} from {g.current_user.name}.",
        )
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not place the order."}), 500

    return (
        jsonify(
            {
                "message": "Order placed successfully.",
                "order": order_to_dict(order),
            }
        ),
        201,
    )


@order_bp.route("/api/orders/<int:order_id>/cancel", methods=["POST"])
@role_required("customer")
def cancel_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found."}), 404
    if order.customer_id != g.current_user.id:
        return jsonify({"error": "You cannot cancel this order."}), 403
    if order.status != "Pending":
        return (
            jsonify(
                {"error": "Only pending orders can be cancelled by customers."}
            ),
            400,
        )

    try:
        restore_order_stock(order)
        order.status = "Cancelled"
        create_notification(
            order_farmer_id(order),
            f"Order #{order.id} was cancelled by the customer.",
        )
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not cancel the order."}), 500

    return jsonify(
        {
            "message": "Order cancelled and stock restored.",
            "order": order_to_dict(order),
        }
    )
