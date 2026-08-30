# mernboilerplatejs

Production-ready Express backend generated using **create-backend-app**.

## Features

- **Language:** JavaScript
- **Module System:** ES Modules
- **Architecture:** Modular (Class Based)
- **Database:** MongoDB (Mongoose)
- **Auth:** Enabled (Multi Token (Access + Refresh))
- **Logger:** Pino Logger
- **Swagger Documentation:** Enabled (`/docs`)
- **Docker Support:** Disabled
- **Testing:** Jest

## Getting Started

### 1. Environment Setup
Copy `.env.example` to `.env` and update the variables:
```bash
cp .env.example .env
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```




### API Documentation
Access Swagger UI at: `http://localhost:5000/docs`