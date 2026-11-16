import os

from flask import Flask, jsonify, render_template
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from config import Config
from models import db
from routes import (
    auth_bp,
    customer_bp,
    delivery_bp,
    farmer_bp,
    notification_bp,
    order_bp,
    product_bp,
)

app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

app.register_blueprint(auth_bp)
app.register_blueprint(product_bp)
app.register_blueprint(order_bp)
app.register_blueprint(farmer_bp)
app.register_blueprint(customer_bp)
app.register_blueprint(delivery_bp)
app.register_blueprint(notification_bp)


def ensure_phase3_schema():
    inspector = inspect(db.engine)
    if "orders" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("orders")}
    if "delivery_agent_id" not in columns:
        db.session.execute(
            text("ALTER TABLE orders ADD COLUMN delivery_agent_id INT NULL")
        )
        db.session.commit()
        print("[KisanMitra] Added delivery_agent_id to the orders table.")
        inspector = inspect(db.engine)

    index_names = {
        index["name"] for index in inspector.get_indexes("orders")
    }
    if "ix_orders_delivery_agent_id" not in index_names:
        db.session.execute(
            text(
                "CREATE INDEX ix_orders_delivery_agent_id "
                "ON orders (delivery_agent_id)"
            )
        )
        db.session.commit()
        print("[KisanMitra] Added the delivery agent index.")


def create_database_tables():
    with app.app_context():
        try:
            db.create_all()
            ensure_phase3_schema()
            print("[KisanMitra] Database tables are ready.")
        except OperationalError as error:
            db.session.rollback()
            print("\n[KisanMitra] Could not connect to MySQL.")
            print("  1. Make sure the MySQL service is running.")
            print("  2. Make sure the database 'kisanmitra_db' exists.")
            print("  3. Check DB_USER and DB_PASSWORD in your .env file.")
            print(f"  MySQL said: {error.orig}\n")
        except SQLAlchemyError as error:
            db.session.rollback()
            print(f"[KisanMitra] Database setup failed: {error}")


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/test-db")
def test_db():
    try:
        db.session.execute(text("SELECT 1"))
        db.session.commit()

        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        required_tables = [
            "users",
            "products",
            "orders",
            "order_items",
            "notifications",
        ]
        missing_tables = [
            table for table in required_tables if table not in tables
        ]

        if missing_tables:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Database connected, but some tables are missing.",
                        "missing_tables": missing_tables,
                    }
                ),
                500,
            )

        order_columns = {
            column["name"]
            for column in inspector.get_columns("orders")
        }
        if "delivery_agent_id" not in order_columns:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": (
                            "Database connected, but orders.delivery_agent_id "
                            "is missing. Restart the app to update the table."
                        ),
                    }
                ),
                500,
            )

        return jsonify(
            {
                "status": "success",
                "message": "Database connection successful.",
                "database": Config.DB_NAME,
                "tables": required_tables,
            }
        )

    except OperationalError as error:
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        "Could not connect to MySQL. Start MySQL and check "
                        "your .env database settings."
                    ),
                    "details": str(error.orig),
                }
            ),
            500,
        )
    except SQLAlchemyError as error:
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "A database error occurred.",
                    "details": str(error),
                }
            ),
            500,
        )


@app.errorhandler(413)
def file_too_large(error):
    return (
        jsonify({"error": "The uploaded image is too large. Maximum size is 5 MB."}),
        413,
    )


@app.errorhandler(OperationalError)
def handle_database_error(error):
    return (
        "<h2>Database connection failed</h2>"
        "<p>Please start MySQL, create the <b>kisanmitra_db</b> database, "
        "and check your .env file.</p>"
        "<p><a href='/test-db'>Try the database check again</a> or "
        "<a href='/'>go back home</a>.</p>",
        500,
    )


create_database_tables()


if __name__ == "__main__":
    app.run(debug=True)
