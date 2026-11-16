from .auth_routes import auth_bp
from .customer_routes import customer_bp
from .delivery_routes import delivery_bp
from .farmer_routes import farmer_bp
from .notification_routes import notification_bp
from .order_routes import order_bp
from .product_routes import product_bp

__all__ = [
    "auth_bp",
    "customer_bp",
    "delivery_bp",
    "farmer_bp",
    "notification_bp",
    "order_bp",
    "product_bp",
]
