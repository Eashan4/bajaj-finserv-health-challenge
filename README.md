# BFHL — Node Hierarchy Analyzer

Full Stack Engineering Challenge for **Bajaj Finserv Health**.

## Quick Start

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Configure your identity — edit backend/.env
#    USER_ID, EMAIL_ID, COLLEGE_ROLL_NUMBER

# 3. Run locally
npm run dev
```

Open **http://localhost:3000** to use the frontend.  
API endpoint: **POST http://localhost:3000/bfhl**

## API Specification

### `POST /bfhl`

**Request:**
```json
{ "data": ["A->B", "A->C", "B->D"] }
```

**Response:** `user_id`, `email_id`, `college_roll_number`, `hierarchies`, `invalid_entries`, `duplicate_edges`, `summary`.

### `GET /bfhl`

Returns `{ "operation_code": 1 }`.

## Deployment

### Vercel
```bash
npm i -g vercel
vercel --prod
```
Set environment variables (`USER_ID`, `EMAIL_ID`, `COLLEGE_ROLL_NUMBER`) in your Vercel project settings.

### Render
1. Connect your GitHub repo on [render.com](https://render.com).
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Add env vars in the Render dashboard.

## Project Structure

```text
├── backend/
│   ├── server.js          Express server + API logic
│   ├── .env               Configuration (gitignored)
│   ├── .env.example       Template
│   ├── vercel.json        Vercel deployment config
│   └── package.json
└── frontend/
    ├── index.html         Frontend UI
    ├── styles.css         Design system
    └── app.js             Frontend logic
```

## Tech Stack

- **Backend:** Node.js, Express, CORS
- **Frontend:** HTML5, CSS3, JavaScript (no framework)
- **Config:** dotenv
