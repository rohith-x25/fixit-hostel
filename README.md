# FixIt Hostel - Hostel Maintenance Request Management System
Node.js + Express + SQLite + vanilla JS frontend, with Docker, GitHub Actions CI and Kubernetes manifests.

## Run locally
1. Install Node.js LTS (v20 or v22) from https://nodejs.org
2. `npm install`
3. `npm start`  -> open http://localhost:3000
4. `npm test`   -> runs the automated API tests

Demo logins: student@sru.edu / Student@123, tech@sru.edu / Tech@123, admin@sru.edu / Admin@123

## Docker
`docker build -t fixit-hostel:1.0 .` then `docker run -p 3000:3000 -v fixit-data:/data fixit-hostel:1.0`
(or `docker compose up --build`)

## Kubernetes (Docker Desktop / minikube)
`kubectl apply -f k8s/deployment.yaml` -> open http://localhost:30080 (minikube: `minikube service fixit-hostel`)
Deployed using Docker and Kubernetes.
