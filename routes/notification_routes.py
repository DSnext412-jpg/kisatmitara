from flask import Blueprint, g, jsonify
from sqlalchemy.exc import SQLAlchemyError

from models import Notification, db
from routes.helpers import notification_to_dict, role_required

notification_bp = Blueprint("notifications", __name__)


@notification_bp.route("/api/notifications")
@role_required("customer", "farmer", "delivery_agent")
def list_notifications():
    notifications = (
        Notification.query.filter_by(user_id=g.current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(20)
        .all()
    )
    return jsonify(
        [notification_to_dict(notification) for notification in notifications]
    )


@notification_bp.route(
    "/api/notifications/<int:notification_id>/read",
    methods=["POST"],
)
@role_required("customer", "farmer", "delivery_agent")
def mark_notification_read(notification_id):
    notification = db.session.get(Notification, notification_id)
    if not notification:
        return jsonify({"error": "Notification not found."}), 404
    if notification.user_id != g.current_user.id:
        return jsonify({"error": "You cannot update this notification."}), 403

    notification.is_read = True
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not update the notification."}), 500

    return jsonify(
        {
            "message": "Notification marked as read.",
            "notification": notification_to_dict(notification),
        }
    )


@notification_bp.route("/api/notifications/read-all", methods=["POST"])
@role_required("customer", "farmer", "delivery_agent")
def mark_all_notifications_read():
    updated = Notification.query.filter_by(
        user_id=g.current_user.id, is_read=False
    ).update({"is_read": True}, synchronize_session=False)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not update notifications."}), 500

    return jsonify(
        {
            "message": f"{updated} notification(s) marked as read.",
            "updated": updated,
        }
    )
