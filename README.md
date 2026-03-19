# AMAST Course Matching
A Node.js + Express web app for importing Malaysian university course catalogues and matching uploaded results against available courses.

## What It Does

- Imports course data from supported university sources
- Lets admins preview import changes before applying them
- Supports field-level import review and deletion from the admin import UI
- Uses Alibaba Qwen to generate richer course descriptions and normalize general entry requirements
- Lets users upload official STPM PDF result slips instead of entering subjects manually
- Matches students to courses based mainly on taken subjects, course requirements, and course descriptions

## Current University Support

- UM
- UPM
- UKM
- USM
- UTM
- UUM

## Main Pages

- `/` landing page
- `/user` student portal
- `/catalog` public course catalogue
- `/admin/login` admin login
- `/admin` admin dashboard
- `/admin/imports` admin import centre
- `/admin/catalog` admin catalogue editor

## Tech Stack

- Node.js
- Express
- Sequelize
- MySQL
- Multer
- pdf-parse
- Alibaba Qwen via DashScope-compatible API

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create the environment file

Copy `.env.example` to `.env` and update the values.

Example:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_NAME=course_matching
DB_SYNC_ALTER=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
QWEN_API_KEY=
QWEN_MODEL=qwen-plus
QWEN_ENDPOINT=https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
QWEN_TIMEOUT_MS=12000
QWEN_MAX_CANDIDATES=6
IMPORT_QWEN_ENRICHMENT_DEFAULT=false
```

Important:

- Keep `DB_SYNC_ALTER=false` for normal development
- Repeated Sequelize `alter` syncs on MySQL can create duplicate indexes over time

### 3. Start the app

Development:

```bash
npm run dev
```

Production-style:

```bash
npm start
```

The server runs on `http://localhost:3000` by default.

## Import Workflow

The admin import page supports:

- scraper selection
- optional direct source URL
- optional CSV upload
- optional general entry requirement inputs for:
  - STPM
  - Matriculation
  - Diploma/Equivalent
- optional course-name normalization

Import behavior:

- preview first
- compare current vs incoming course data
- choose specific fields to apply
- optionally delete existing entries
- apply only the selected changes

Qwen can be used during import to:

- generate richer course descriptions
- infer duration, study mode, and broad entry requirements
- normalize general pathway requirements into concise minimum summaries

If a course has no specific requirements, normalized general requirements can be applied as a fallback.

## STPM Matching Flow

The user uploads an STPM result PDF on `/user`.

The backend:

- extracts subjects, grades, and grade points from the PDF
- converts extracted grade points into matcher scores
- compares the student profile against imported courses
- ranks matches mainly by subject alignment
- explains why each matched course suits the student using:
  - matched subjects
  - course description
  - entry requirements

## Admin Catalogue Editing

Admins can open `/admin/catalog` to:

- browse courses by university and faculty
- edit course content inline
- update fields such as:
  - name
  - faculty
  - study mode
  - duration
  - description
  - entry requirements
- delete course records

## Import Scripts

You can also trigger imports from the command line:

```bash
npm run import:um
npm run import:upm
npm run import:ukm
npm run import:usm
npm run import:utm
npm run import:uum
```

## API Overview

Main API groups:

- `/api/admin`
- `/api/courses`
- `/api/universities`
- `/api/matches`
- `/api/students`

Examples:

- `GET /api/courses`
- `GET /api/universities`
- `POST /api/matches/stpm-upload`
- `POST /api/admin/imports/preview`
- `POST /api/admin/imports/apply`

## Notes

- Qwen is optional, but many enrichment and fallback features depend on it
- Public catalogue pages are read-only
- Admin catalogue editing requires admin login
- Some import logic is scraper-specific because university sites vary widely in structure

## License

Currently not specified.
