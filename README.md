# CI/CD Pipeline for Web Application Deployment

A complete, working, demo-ready project featuring a containerized Node.js application deployed automatically via GitHub Actions, combined with a real-time monitoring dashboard showing the pipeline run history.

## System Architecture

```text
Developer → git push → GitHub Repo
                            │
                            ▼
                    GitHub Actions Pipeline
                    ┌─────────────────────┐
                    │ 1. Checkout code     │
                    │ 2. Install deps      │
                    │ 3. Lint              │
                    │ 4. Run tests         │
                    │ 5. Build app         │
                    │ 6. Build Docker image│
                    │ 7. Push to Docker Hub│
                    │ 8. Call deploy hook  │
                    └─────────┬───────────┘
                              │
                              ▼
                        Render (hosting)
                              │
                              ▼
                    Live Web App + /dashboard
                              │
                              ▼
                          End User
```

## Features

- **Express App:** Lightweight server serving static pages, dynamic version info (`/api/version`), and health telemetry (`/health`).
- **Jest/Supertest:** Thorough unit testing for standard routes and 404 behavior.
- **Dockerization:** Multi-stage `Dockerfile` optimizing build size and dependencies.
- **GitHub Actions:** Structured flow separating linting, testing, dockerization, and triggering Render Webhooks.
- **Pipeline Dashboard:** A real-time client-side status page displaying the last 15 workflow runs across one or more repositories (with statuses, runtimes, trigger logs) by calling the GitHub REST API directly.

## Setup Instructions

### 1. Local Development
To run this application locally, you can run the following commands (assuming Node.js is installed on your machine):

```bash
cd my-web-app
npm install
npm run lint  # Checks for code style and errors
npm test      # Runs the Jest unit test suite
npm start     # Runs the local Express server
```

The application will be accessible at `http://localhost:3000` and the dashboard at `http://localhost:3000/dashboard`.

### 2. Docker Execution
Alternatively, you can build and run the Docker image locally (if Docker Daemon is running):

```bash
cd my-web-app
docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t my-web-app:latest .
docker run -p 3000:3000 my-web-app:latest
```

## How the Pipeline Works

1. **Trigger on PR / Feature Branches:** Any push or PR targeting `main` fires the `build-and-test` job to validate code standards (ESLint) and pass tests (Jest).
2. **Trigger on Merge/Push to Main:** If `build-and-test` passes on `main`, the `dockerize-and-deploy` job initiates:
   - Builds a containerized package and tags it with both `:latest` and the short commit SHA.
   - Pushes the image tags to Docker Hub.
   - Calls the Render Deploy Webhook.
   - Bakes in the Git commit SHA (`GIT_SHA`) into the final environment to reflect on `/api/version`.

## Live Dashboard

The dashboard page is hosted alongside the app at `/dashboard`.
When you first open it, enter your GitHub **Owner** and one or more **Repository names** in the configuration panel to load the run logs. Separate multiple repositories with commas or new lines.
The page auto-updates every 30 seconds to fetch the latest pipeline events.

## "Proof It Works" (Failing Test Demo)

To verify the integrity of the safety gates:
1. Open [tests/app.test.js](file:///e:/newproject/my-web-app/tests/app.test.js) and intentionally break a test assertion (e.g., change `expect(response.body).toHaveProperty('status', 'ok')` to `expect(response.body).toHaveProperty('status', 'broken')`).
2. Commit and push the changes.
3. Observe that the GitHub Actions pipeline runs, but fails at the `Run Tests` step.
4. The `dockerize-and-deploy` job is skipped, preserving the live application on Render without deploying the broken code.
