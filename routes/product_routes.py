import os
import uuid

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.utils import secure_filename

from models import OrderItem, Product, db
from routes.helpers import get_float, product_to_dict, role_required

product_bp = Blueprint("products", __name__)


def save_product_image(file):
    if not file or not file.filename:
        return None

    safe_name = secure_filename(file.filename)
    if "." not in safe_name:
        raise ValueError("Please upload a valid image file.")

    extension = safe_name.rsplit(".", 1)[1].lower()
    if extension not in current_app.config["ALLOWED_IMAGE_EXTENSIONS"]:
        raise ValueError("Only PNG, JPG, JPEG, GIF and WEBP images are allowed.")
    if not (file.mimetype or "").startswith("image/"):
        raise ValueError("Please upload a valid image file.")

    filename = f"{uuid.uuid4().hex}.{extension}"
    file.save(os.path.join(current_app.config["UPLOAD_FOLDER"], filename))
    return filename


def delete_product_image(filename):
    if not filename:
        return
    image_path = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)
    try:
        os.remove(image_path)
    except OSError:
        pass


def validate_product_form():
    name = (request.form.get("name") or "").strip()
    category = (request.form.get("category") or "").strip()
    description = (request.form.get("description") or "").strip()
    unit = (request.form.get("unit") or "kg").strip()
    price = get_float(request.form.get("price"))
    quantity = get_float(request.form.get("quantity"))

    if not name or len(name) > 100:
        return None, "Please enter a product name (maximum 100 characters)."
    if not category or len(category) > 50:
        return None, "Please choose a category."
    if len(description) > 5000:
        return None, "Description is too long."
    if not unit or len(unit) > 20:
        return None, "Please enter a valid unit."
    if price is None or price <= 0:
        return None, "Price must be greater than zero."
    if quantity is None or quantity < 0:
        return None, "Quantity cannot be negative."

    return {
        "name": name,
        "category": category,
        "description": description,
        "price": round(price, 2),
        "quantity": round(quantity, 2),
        "unit": unit,
    }, None


@product_bp.route("/api/products")
def list_products():
    search = (request.args.get("search") or "").strip()
    category = (request.args.get("category") or "").strip()

    query = Product.query.filter(Product.quantity > 0)

    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    if category and category.lower() != "all":
        query = query.filter(Product.category == category)

    products = query.order_by(Product.created_at.desc()).all()
    return jsonify([product_to_dict(product) for product in products])


@product_bp.route("/api/products/<int:product_id>")
def product_details(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found."}), 404
    return jsonify(product_to_dict(product))


@product_bp.route("/api/products", methods=["POST"])
@role_required("farmer")
def create_product():
    values, error = validate_product_form()
    if error:
        return jsonify({"error": error}), 400

    try:
        image_filename = save_product_image(request.files.get("image"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    product = Product(
        farmer_id=g.current_user.id,
        name=values["name"],
        category=values["category"],
        description=values["description"],
        price=values["price"],
        quantity=values["quantity"],
        unit=values["unit"],
        image=image_filename,
    )

    try:
        db.session.add(product)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        delete_product_image(image_filename)
        return jsonify({"error": "Could not save the product."}), 500

    return (
        jsonify(
            {
                "message": "Product added successfully.",
                "product": product_to_dict(product),
            }
        ),
        201,
    )


@product_bp.route("/api/products/<int:product_id>/update", methods=["POST"])
@role_required("farmer")
def update_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found."}), 404
    if product.farmer_id != g.current_user.id:
        return jsonify({"error": "You can only edit your own products."}), 403

    values, error = validate_product_form()
    if error:
        return jsonify({"error": error}), 400

    try:
        new_image = save_product_image(request.files.get("image"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    old_image = product.image
    product.name = values["name"]
    product.category = values["category"]
    product.description = values["description"]
    product.price = values["price"]
    product.quantity = values["quantity"]
    product.unit = values["unit"]
    if new_image:
        product.image = new_image

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        delete_product_image(new_image)
        return jsonify({"error": "Could not update the product."}), 500

    if new_image and old_image:
        delete_product_image(old_image)

    return jsonify(
        {
            "message": "Product updated successfully.",
            "product": product_to_dict(product),
        }
    )


@product_bp.route("/api/products/<int:product_id>/delete", methods=["POST"])
@role_required("farmer")
def delete_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found."}), 404
    if product.farmer_id != g.current_user.id:
        return jsonify({"error": "You can only delete your own products."}), 403

    if OrderItem.query.filter_by(product_id=product.id).first():
        return (
            jsonify(
                {
                    "error": (
                        "This product is part of an existing order and "
                        "cannot be deleted."
                    )
                }
            ),
            400,
        )

    image_filename = product.image
    try:
        db.session.delete(product)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not delete the product."}), 500

    delete_product_image(image_filename)
    return jsonify({"message": "Product deleted successfully."})
