import math
from functools import wraps

from flask import g, jsonify, session, url_for

from models import Notification, User, db

ROLES = ["customer", "farmer", "delivery_agent"]
ROLE_NAMES = {
    "customer": "Customer",
    "farmer": "Farmer",
    "delivery_agent": "Delivery agent",
}


def normalise_role(value):
    role = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if role == "deliveryagent":
        role = "delivery_agent"
    return role if role in ROLES else None


def get_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def get_current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    return db.session.get(User, user_id)


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Please log in first."}), 401
        g.current_user = user
        return view(*args, **kwargs)

    return wrapped_view


def role_required(*allowed_roles):
    def decorator(view):
        @wraps(view)
        def wrapped_view(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "Please log in first."}), 401
            if user.role not in allowed_roles:
                return jsonify({"error": "You are not allowed to do this."}), 403
            g.current_user = user
            return view(*args, **kwargs)

        return wrapped_view

    return decorator


def user_to_dict(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "role_name": ROLE_NAMES.get(user.role, user.role),
    }


def product_to_dict(product):
    image_url = ""
    if product.image:
        image_url = url_for("static", filename=f"uploads/{product.image}")
    return {
        "id": product.id,
        "farmer_id": product.farmer_id,
        "farmer_name": product.farmer.name if product.farmer else "",
        "farmer_phone": product.farmer.phone if product.farmer else "",
        "name": product.name,
        "category": product.category,
        "description": product.description or "",
        "price": product.price,
        "quantity": product.quantity,
        "unit": product.unit,
        "image": product.image,
        "image_url": image_url,
        "created_at": (
            product.created_at.strftime("%d %b %Y")
            if product.created_at
            else ""
        ),
    }


def order_item_to_dict(item):
    product = item.product
    image_url = ""
    if product and product.image:
        image_url = url_for("static", filename=f"uploads/{product.image}")
    return {
        "id": item.id,
        "product_id": item.product_id,
        "product_name": product.name if product else "Deleted product",
        "category": product.category if product else "",
        "unit": product.unit if product else "kg",
        "image_url": image_url,
        "farmer_id": product.farmer_id if product else None,
        "farmer_name": (
            product.farmer.name if product and product.farmer else ""
        ),
        "quantity": item.quantity,
        "price": item.price,
        "subtotal": round(item.price * item.quantity, 2),
    }


def delivery_status_for(order):
    if order.status == "Delivered":
        return "Delivered"
    if order.status == "Cancelled":
        return "Cancelled"
    if order.status == "Dispatched":
        if order.delivery_agent:
            return "Assigned to delivery agent"
        return "Waiting for delivery agent"
    if order.status == "Confirmed":
        return "Preparing for dispatch"
    return "Waiting for farmer confirmation"


def order_farmer_id(order):
    for item in order.items:
        if item.product:
            return item.product.farmer_id
    return None


def create_notification(user_id, message):
    if not user_id or not message:
        return
    db.session.add(Notification(user_id=user_id, message=message[:255]))


def notification_to_dict(notification):
    return {
        "id": notification.id,
        "message": notification.message,
        "is_read": bool(notification.is_read),
        "created_at": (
            notification.created_at.strftime("%d %b %Y, %I:%M %p")
            if notification.created_at
            else ""
        ),
    }


def order_to_dict(order, farmer_id=None):
    items = order.items
    if farmer_id is not None:
        items = [
            item
            for item in items
            if item.product and item.product.farmer_id == farmer_id
        ]

    item_list = [order_item_to_dict(item) for item in items]
    total = (
        round(sum(item["subtotal"] for item in item_list), 2)
        if farmer_id is not None
        else round(order.total_amount, 2)
    )

    return {
        "id": order.id,
        "customer_id": order.customer_id,
        "customer_name": order.customer.name if order.customer else "",
        "customer_phone": order.customer.phone if order.customer else "",
        "delivery_address": order.delivery_address,
        "status": order.status,
        "delivery_status": delivery_status_for(order),
        "delivery_agent_id": order.delivery_agent_id,
        "delivery_agent_name": (
            order.delivery_agent.name if order.delivery_agent else ""
        ),
        "delivery_agent_phone": (
            order.delivery_agent.phone if order.delivery_agent else ""
        ),
        "order_date": (
            order.order_date.strftime("%d %b %Y, %I:%M %p")
            if order.order_date
            else ""
        ),
        "total_amount": total,
        "items": item_list,
    }


def restore_order_stock(order):
    if order.status not in ("Pending", "Confirmed"):
        return
    for item in order.items:
        if item.product:
            item.product.quantity = round(
                item.product.quantity + item.quantity, 2
            )
