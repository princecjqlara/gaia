# Gaia - Team Management System

A React-based team management system for tracking clients, subscriptions, and project phases.

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Supabase** - Backend database and authentication
- **Node.js** - Runtime environment

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:3000`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Project Structure

```
src/
  components/     # React components
  hooks/          # Custom React hooks
  services/       # API services (Supabase)
  utils/          # Utility functions
  App.jsx         # Main app component
  main.jsx        # Entry point
```

## Features

- Client management with phases (Booked, Preparing, Testing, Running)
- Package management (Basic, Star, Fire, Crown, Custom)
- Payment tracking
- Role-based access (Admin/User)
- Real-time sync with Supabase
- Offline mode with localStorage fallback

