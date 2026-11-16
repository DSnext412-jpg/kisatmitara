# KisanMitra

KisanMitra is a simple farmer-to-customer marketplace built with Flask and
MySQL. Farmers can list produce, customers can order it, and delivery agents
can accept dispatched orders and mark them as delivered.

## Features

### Customers

- Register and log in.
- Browse and search available produce.
- Manage a cart and place orders.
- View order history, current order status, and delivery status.
- Cancel pending orders.
- View notifications for confirmation, dispatch, delivery-agent assignment,
  and delivery.

### Farmers

- Register and log in.
- Add, edit, and delete produce listings with optional images.
- View incoming orders containing their products.
- Confirm, dispatch, or cancel orders using allowed status transitions.
- See the assigned delivery agent and delivery status.
- View notifications for new orders, cancellations, and completed deliveries.

### Delivery Agents

- Register and log in.
- View dispatched orders waiting for an agent.
- Accept a delivery and view the customer's contact and delivery address.
- Mark an accepted delivery as delivered.
- View completed deliveries.
- View notifications.

## Tech Stack

- Python 3
- Flask
- Flask-SQLAlchemy
- MySQL 8
- PyMySQL
- HTML, CSS, and vanilla JavaScript

## Project Structure

```text
KisanMitra/
|-- app.py                  App setup, config, database setup, blueprint registration
|-- app.py.backup           Backup of app.py before the route refactor
|-- config.py               Environment-based configuration
|-- models.py               User, Product, Order, OrderItem, Notification models
|-- requirements.txt        Python dependencies
|-- .env.example            Example environment variables
|-- routes/
|   |-- __init__.py         Blueprint exports
|   |-- helpers.py          Shared auth, session, and response helpers
|   |-- auth_routes.py      Registration, login, logout, session
|   |-- product_routes.py   Product browsing, search, and farmer CRUD
|   |-- order_routes.py     Place order, cancel order, stock handling
|   |-- customer_routes.py  Customer order history and order details
|   |-- farmer_routes.py    Farmer products, incoming orders, status updates
|   |-- delivery_routes.py  Delivery agent deliveries and status actions
|   `-- notification_routes.py  Notification list and read actions
|-- templates/
|   `-- index.html          Main single-page frontend
|-- static/
|   |-- css/style.css       Frontend styles
|   |-- js/app.js           Frontend behaviour and dashboards
|   `-- uploads/            Uploaded product images
`-- venv/                   Local virtual environment (not committed)
```

## Database Tables

- `users`: customers, farmers, and delivery agents.
- `products`: produce listings and available stock.
- `orders`: customer orders, status, delivery address, and assigned agent.
- `order_items`: products and quantities belonging to each order.
- `notifications`: simple per-user order notifications.

## Order Workflow

Allowed order status changes:

```text
Pending -> Confirmed -> Dispatched -> Delivered
Pending -> Cancelled
Confirmed -> Cancelled
```

Rules:

- A cart can contain products from only one farmer.
- Stock is reduced when an order is placed.
- Stock is restored only when a pending or confirmed order is cancelled.
- A cancelled order cannot be cancelled or restored again.
- While an order is dispatched, one delivery agent may accept it.
- The assigned agent can mark the order as delivered.
- Orders are never moved backwards to an earlier status.

Delivery status shown to users:

- `Waiting for farmer confirmation`
- `Preparing for dispatch`
- `Waiting for delivery agent`
- `Assigned to delivery agent`
- `Delivered`
- `Cancelled`

## Setup

### 1. Create the database

Start MySQL and create the database:

```sql
CREATE DATABASE kisanmitra_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

### 2. Create and activate a virtual environment

Windows PowerShell:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```powershell
pip install -r requirements.txt
```

### 4. Configure environment variables

Copy `.env.example` to `.env` and update the values:

```text
SECRET_KEY=replace-with-a-random-secret-key
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_HOST=localhost
DB_PORT=3306
DB_NAME=kisanmitra_db
```

Use your own MySQL username and password. Do not commit `.env`.

### 5. Start the application

```powershell
python app.py
```

Open `http://127.0.0.1:5000` in a browser.

Check the database connection and tables at:

```text
http://127.0.0.1:5000/test-db
```

## Existing Database Update

On startup, the application creates missing tables. For a database created
before Phase 3, it also adds:

- the `orders.delivery_agent_id` column,
- an index for `orders.delivery_agent_id`,
- the `notifications` table.

Restart the application after pulling the latest code, then open `/test-db`
to confirm the update.

## Main API Routes

### Authentication

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

### Products

- `GET /api/products`
- `GET /api/products/<id>`
- `GET /api/farmer/products`
- `POST /api/products`
- `POST /api/products/<id>/update`
- `POST /api/products/<id>/delete`

### Orders

- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/<id>`
- `POST /api/orders/<id>/cancel`
- `GET /api/farmer/orders`
- `POST /api/farmer/orders/<id>/status`

### Delivery Agent

- `GET /api/agent/deliveries`
- `GET /api/agent/deliveries/<id>`
- `POST /api/agent/deliveries/<id>/accept`
- `POST /api/agent/deliveries/<id>/deliver`

### Notifications

- `GET /api/notifications`
- `POST /api/notifications/<id>/read`
- `POST /api/notifications/read-all`

## Manual Test Checklist

1. Register a farmer, a customer, and a delivery agent.
2. Add a product as the farmer.
3. Place an order as the customer.
4. Confirm and dispatch the order as the farmer.
5. Accept the delivery as the delivery agent.
6. Check the customer dashboard for the agent and delivery status.
7. Mark the delivery as delivered.
8. Check customer, farmer, and agent notifications.
9. Try invalid actions such as accepting a pending order or cancelling a
   dispatched order; these should be rejected.

## Notes

- Notifications are stored in MySQL and refresh with the dashboard. There is no
  real-time WebSocket or email delivery.
- Uploaded images are stored locally in `static/uploads`.
- The Flask development server is intended for local development, not
  production deployment.
