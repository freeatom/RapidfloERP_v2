# RapidFlo ERP v2

RapidFlo ERP is a comprehensive, multi-tenant Enterprise Resource Planning system built for modern businesses. It offers a complete suite of tools to manage Customer Relationships (CRM), Finance, Human Resources, Inventory, Projects, and more in a unified, premium web interface.

## 🌟 Key Features

The system is modular, allowing features to be enabled or disabled based on specific company needs:

- **📊 Dashboard & Analytics**: Centralized overview with beautiful charts (Recharts) and KPI tracking.
- **🤝 CRM (Customer Relationship Management)**: Track Leads, Contacts, Accounts, and Opportunities (Deals) effectively.
- **💰 Finance & Accounting**: Manage Quotes, Invoices, Expenses, Payments, and general ledger operations.
- **📦 Inventory Management**: Track Products, Stock adjustments, Warehouses, Categories, and Suppliers.
- **🛒 Procurement**: Handle Purchase Orders and vendor relationships.
- **👥 HRMS (Human Resources)**: Employee profiles, Attendance, Leave requests, and Payroll.
- **📋 Project Management**: Track Projects, Tasks, and timesheets.
- **📞 Support Desk**: Manage Customer Tickets and resolutions.
- **📑 Document Management**: Centralized, secure document uploading and retrieval.
- **⚙️ Workflows & Automation**: Streamline operations with customizable workflows.
- **🔐 Multi-Tenant Architecture**: Robust data isolation with a primary database for configuration and separate SQLite database files for each registered company.
- **🛡️ Role-Based Access Control (RBAC)**: Fine-grained permissions for Super Admins, Company Admins, Managers, and standard Users.

## 🛠️ Technology Stack

**Frontend (Client)**:
- **[React 18](https://reactjs.org/)** & **[Vite](https://vitejs.dev/)**
- **[React Router v6](https://reactrouter.com/)** for navigation.
- **[Lucide React](https://lucide.dev/)** for clean, modern iconography.
- **[Recharts](https://recharts.org/)** for data visualization.
- **Vanilla CSS (Glassmorphism)**: Custom, sleek UI with a responsive design and dark-mode aesthetics.

**Backend (Server)**:
- **[Node.js](https://nodejs.org/)** & **[Express](https://expressjs.com/)**
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)**: Blazing fast, synchronous SQLite3 driver for Node.js.
- **[Multer](https://github.com/expressjs/multer)**: For handling file and document uploads.
- **[jsonwebtoken (JWT)](https://jwt.io/)**: Secure authentication and session management.
- **Security Middleware**: `helmet`, `cors`, and `express-rate-limit`.

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- Git

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/freeatom/RapidfloERP_v2.git
   cd RapidfloERP_v2
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```
   *(This will install dependencies for both the Express backend and the React frontend via concurrently)*

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   This command uses `concurrently` to run both:
   - The Vite development server (usually at `http://localhost:5173`)
   - The Express backend server (at `http://localhost:3001`)

4. **Access the App**:
   Open your browser and navigate to `http://localhost:5173`

*(Note: The database schemas will be automatically initialized in the `/server/data` directory on the first backend run).*

## ☁️ Deployment

This project builds the frontend and serves it directly through Express in production environments.

### Deploying to platforms like Railway or Render

1. **Build Command**:
   ```bash
   npm install && npm run build
   ```
2. **Start Command**:
   ```bash
   node server/index.js
   ```

*In a production environment, the Express server will automatically serve the built React files located in the `dist/` directory on the defined `PORT` (e.g., `8080` or `3001`).*

## 📁 Project Structure

```text
rapidERP_v2/
├── src/                 # React Frontend Code
│   ├── components/      # Reusable UI components (Layout, Sidebar, Modals)
│   ├── pages/           # Application views (CRM, Finance, Inventory, etc.)
│   ├── App.jsx          # Main application wrapper and Auth Context
│   └── index.css        # Global styles and design system
├── server/              # Express Backend Code
│   ├── db/              # Database schema and initialization scripts
│   ├── routes/          # API endpoints per module
│   ├── middleware/      # Auth, RBAC, Tenancy, and Audit logging
│   ├── data/            # Local SQLite database storage (*.db files)
│   └── index.js         # Main Express application entry point
├── uploads/             # Ignored directory for local file attachments
└── package.json         # Project dependencies and scripts
```
